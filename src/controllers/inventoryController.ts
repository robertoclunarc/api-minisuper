import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { InventoryBatch } from '../models/InventoryBatch';
import { Product } from '../models/Product';
import { CurrencyService } from '../services/currencyService';
import { batchEntrySchema, stockAdjustmentSchema } from '../validations/inventoryValidation';
import { AuthRequest } from '../middleware/auth';

export class InventoryController {
  private batchRepository = AppDataSource.getRepository(InventoryBatch);
  private productRepository = AppDataSource.getRepository(Product);
  private currencyService = new CurrencyService();

  public createBatch = async (req: AuthRequest, res: Response) => {
    try {
      const { error, value } = batchEntrySchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const { 
        producto_id, 
        proveedor_id,
        numero_lote, 
        cantidad_inicial, 
        precio_costo_usd, 
        fecha_vencimiento 
      } = value;

      // Verificar que el producto existe
      const product = await this.productRepository.findOne({
        where: { id: producto_id, activo: true }
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }

      // Obtener tasa de cambio actual
      const exchangeRate = await this.currencyService.getCurrentExchangeRate();

      const batchData: any = {
        producto_id,
        proveedor_id,
        numero_lote,
        cantidad_inicial,
        cantidad_actual: cantidad_inicial,
        precio_costo_usd,
        tasa_cambio_registro: exchangeRate,
        usuario_id: req.user!.id
      };
      if (fecha_vencimiento) {
        batchData.fecha_vencimiento = new Date(fecha_vencimiento);
      }
      const batchCreate = this.batchRepository.create(batchData);
      const batch = Array.isArray(batchCreate) ? batchCreate[0] : batchCreate;
      await this.batchRepository.save(batchCreate);

      if (!batch || !batch.id) {
        return res.status(500).json({
          success: false,
          message: 'Error al crear el lote de inventario'
        });
      }

      const savedBatch = await this.batchRepository
        .createQueryBuilder('lote')
        .leftJoinAndSelect('lote.producto', 'producto')
        .leftJoinAndSelect('lote.proveedor', 'proveedor')
        .leftJoinAndSelect('lote.usuario', 'usuario')
        .where('lote.id = :id', { id: batch.id })
        .getOne();

      res.status(201).json({
        success: true,
        message: 'Lote de inventario creado exitosamente',
        data: {
          ...savedBatch,
          precio_costo_ves: savedBatch?.precio_costo_ves,
          valor_inventario_usd: savedBatch?.valor_inventario_usd,
          valor_inventario_ves: savedBatch?.valor_inventario_ves
        }
      });
    } catch (error) {
      console.error('Error creando lote de inventario:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public createMultipleBatches = async (req: AuthRequest, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { lotes } = req.body;

      if (!Array.isArray(lotes) || lotes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere un array de lotes'
        });
      }

      const batchesToCreate = [];
      const errors = [];
      const exchangeRate = await this.currencyService.getCurrentExchangeRate();

      for (let i = 0; i < lotes.length; i++) {
        const { error, value } = batchEntrySchema.validate(lotes[i]);
        if (error) {
          errors.push({
            index: i,
            errors: error.details.map(detail => detail.message)
          });
          continue;
        }

        // Verificar que el producto existe
        const product = await this.productRepository.findOne({
          where: { id: value.producto_id, activo: true }
        });

        if (!product) {
          errors.push({
            index: i,
            errors: [`Producto con ID ${value.producto_id} no encontrado`]
          });
          continue;
        }

        batchesToCreate.push({
          ...value,
          cantidad_actual: value.cantidad_inicial,
          tasa_cambio_registro: exchangeRate,
          fecha_vencimiento: value.fecha_vencimiento ? new Date(value.fecha_vencimiento) : undefined,
          usuario_id: req.user!.id
        });
      }

      if (errors.length > 0) {
        await queryRunner.rollbackTransaction();
        return res.status(400).json({
          success: false,
          message: 'Errores en algunos lotes',
          errors
        });
      }

      const savedBatches = await queryRunner.manager.save(InventoryBatch, batchesToCreate);
      await queryRunner.commitTransaction();

      res.status(201).json({
        success: true,
        message: `${savedBatches.length} lotes creados exitosamente`,
        data: {
          created_batches: savedBatches.length,
          exchange_rate_used: exchangeRate,
          batches: savedBatches
        }
      });
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creando lotes múltiples:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    } finally {
      await queryRunner.release();
    }
  };

  public getStockByProduct = async (req: Request, res: Response) => {
    try {
      const { product_id } = req.params;

      const product = await this.productRepository.findOne({
        where: { id: Number(product_id), activo: true },
        relations: ['categoria', 'proveedor']
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }

      const batches = await this.batchRepository
        .createQueryBuilder('lote')
        .leftJoinAndSelect('lote.proveedor', 'proveedor')
        .leftJoinAndSelect('lote.usuario', 'usuario')
        .where('lote.producto_id = :product_id', { product_id })
        .orderBy('lote.fecha_vencimiento', 'ASC')
        .addOrderBy('lote.fecha_ingreso', 'ASC')
        .getMany();

      const totalStock = batches.reduce((total, batch) => total + batch.cantidad_actual, 0);
      const availableBatches = batches.filter(batch => batch.cantidad_actual > 0);
      const expiredBatches = batches.filter(batch => batch.isExpired());
      const expiringSoonBatches = batches.filter(batch => batch.isExpiringSoon(30));

      // Cálculos de valor
      const totalValueUSD = batches.reduce((total, batch) => total + batch.valor_inventario_usd, 0);
      const totalValueVES = batches.reduce((total, batch) => total + batch.valor_inventario_ves, 0);

      res.json({
        success: true,
        data: {
          producto: {
            id: product.id,
            codigo_barras: product.codigo_barras,
            nombre: product.nombre,
            categoria: product.categoria?.nombre,
            proveedor: product.proveedor?.nombre,
            stock_minimo: product.stock_minimo
          },
          resumen_stock: {
            total_stock: totalStock,
            total_lotes: batches.length,
            lotes_disponibles: availableBatches.length,
            lotes_vencidos: expiredBatches.length,
            lotes_por_vencer: expiringSoonBatches.length,
            valor_total_usd: Number(totalValueUSD.toFixed(2)),
            valor_total_ves: Number(totalValueVES.toFixed(2)),
            estado_stock: totalStock <= product.stock_minimo ? 'bajo' : 'normal'
          },
          lotes: batches.map(batch => ({
            ...batch,
            precio_costo_ves: batch.precio_costo_ves,
            valor_inventario_usd: batch.valor_inventario_usd,
            valor_inventario_ves: batch.valor_inventario_ves,
            esta_vencido: batch.isExpired(),
            vence_pronto: batch.isExpiringSoon(30)
          }))
        }
      });
    } catch (error) {
      console.error('Error obteniendo stock del producto:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getOverallStock = async (req: Request, res: Response) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        search, 
        categoria_id, 
        low_stock_only = false 
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);

      // Query complejo para obtener stock con JOIN
      let queryBuilder = this.productRepository
        .createQueryBuilder('producto')
        .leftJoinAndSelect('producto.categoria', 'categoria')
        .leftJoinAndSelect('producto.proveedor', 'proveedor')
        .leftJoin('producto.lotes', 'lotes')
        .select([
          'producto.id',
          'producto.codigo_barras',
          'producto.codigo_interno', 
          'producto.nombre',
          'producto.precio_venta_usd',
          'producto.stock_minimo',
          'categoria.nombre',
          'proveedor.nombre',
          'COALESCE(SUM(lotes.cantidad_actual), 0) as stock_total',
          'COUNT(lotes.id) as total_lotes',
          'COUNT(CASE WHEN lotes.cantidad_actual > 0 THEN 1 END) as lotes_disponibles',
          'COUNT(CASE WHEN lotes.fecha_vencimiento < NOW() AND lotes.cantidad_actual > 0 THEN 1 END) as lotes_vencidos',
          'SUM(lotes.cantidad_actual * lotes.precio_costo_usd) as valor_inventario_usd'
        ])
        .where('producto.activo = :activo', { activo: true })
        .groupBy('producto.id')
        .addGroupBy('categoria.id')
        .addGroupBy('proveedor.id');

      if (search) {
        queryBuilder = queryBuilder.andWhere(
          '(producto.codigo_barras LIKE :search OR producto.codigo_interno LIKE :search OR producto.nombre LIKE :search)',
          { search: `%${search}%` }
        );
      }

      if (categoria_id) {
        queryBuilder = queryBuilder.andWhere('producto.categoria_id = :categoria_id', { categoria_id });
      }

      const products = await queryBuilder
        .orderBy('producto.nombre', 'ASC')
        .getRawMany();

      // Procesar resultados
      const processedProducts = products.map(product => {
        const stockTotal = Number(product.stock_total) || 0;
        const stockMinimo = Number(product.stock_minimo) || 0;
        const valorInventarioUSD = Number(product.valor_inventario_usd) || 0;

        return {
          id: product.producto_id,
          codigo_barras: product.producto_codigo_barras,
          codigo_interno: product.producto_codigo_interno,
          nombre: product.producto_nombre,
          categoria: product.categoria_nombre,
          proveedor: product.proveedor_nombre,
          precio_venta_usd: Number(product.producto_precio_venta_usd),
          stock_minimo: stockMinimo,
          stock_total: stockTotal,
          total_lotes: Number(product.total_lotes),
          lotes_disponibles: Number(product.lotes_disponibles),
          lotes_vencidos: Number(product.lotes_vencidos),
          valor_inventario_usd: valorInventarioUSD,
          estado_stock: stockTotal <= stockMinimo ? 'bajo' : 'normal'
        };
      });

      // Filtrar solo productos con stock bajo si se solicita
      let finalProducts = processedProducts;
      if (low_stock_only === 'true') {
        finalProducts = processedProducts.filter(product => product.estado_stock === 'bajo');
      }

      // Paginación manual
      const total = finalProducts.length;
      const paginatedProducts = finalProducts.slice(skip, skip + Number(limit));

      // Estadísticas generales
      const stats = {
        total_productos: processedProducts.length,
        productos_stock_bajo: processedProducts.filter(p => p.estado_stock === 'bajo').length,
        valor_total_inventario_usd: processedProducts.reduce((sum, p) => sum + p.valor_inventario_usd, 0),
        productos_sin_stock: processedProducts.filter(p => p.stock_total === 0).length
      };

      res.json({
        success: true,
        data: {
          productos: paginatedProducts,
          estadisticas: stats,
          pagination: {
            current_page: Number(page),
            total_pages: Math.ceil(total / Number(limit)),
            total_items: total,
            items_per_page: Number(limit)
          }
        }
      });
    } catch (error) {
      console.error('Error obteniendo stock general:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public adjustStock = async (req: AuthRequest, res: Response) => {
    try {
      const { error, value } = stockAdjustmentSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const { lote_id, nueva_cantidad, motivo } = value;

      const batch = await this.batchRepository.findOne({
        where: { id: lote_id },
        relations: ['producto', 'usuario']
      });

      if (!batch) {
        return res.status(404).json({
          success: false,
          message: 'Lote no encontrado'
        });
      }

      const cantidadAnterior = batch.cantidad_actual;
      const diferencia = nueva_cantidad - cantidadAnterior;

      // Actualizar cantidad
      batch.cantidad_actual = nueva_cantidad;
      await this.batchRepository.save(batch);

      // Log del ajuste para auditoría
      console.log(`Ajuste de inventario - Lote: ${lote_id}, Producto: ${batch.producto.nombre}, Cantidad anterior: ${cantidadAnterior}, Nueva cantidad: ${nueva_cantidad}, Diferencia: ${diferencia}, Motivo: ${motivo}, Usuario: ${req.user!.nombre} (${req.user!.id})`);

      res.json({
        success: true,
        message: 'Ajuste de inventario realizado exitosamente',
        data: {
          lote: {
            id: batch.id,
            numero_lote: batch.numero_lote,
            producto: batch.producto.nombre
          },
          ajuste: {
            cantidad_anterior: cantidadAnterior,
            nueva_cantidad,
            diferencia,
            tipo_ajuste: diferencia > 0 ? 'incremento' : 'decremento',
            motivo,
            fecha_ajuste: new Date(),
            usuario: req.user!.nombre
          },
          valor_impacto: {
            usd: Number((diferencia * batch.precio_costo_usd).toFixed(2)),
            ves: Number((diferencia * batch.precio_costo_ves).toFixed(2))
          }
        }
      });
    } catch (error) {
      console.error('Error ajustando inventario:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getExpiringProducts = async (req: Request, res: Response) => {
    try {
      const { days = 30 } = req.query;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + Number(days));

      const expiringBatches = await this.batchRepository
        .createQueryBuilder('lote')
        .leftJoinAndSelect('lote.producto', 'producto')
        .leftJoinAndSelect('lote.proveedor', 'proveedor')
        .leftJoinAndSelect('producto.categoria', 'categoria')
        .where('lote.fecha_vencimiento IS NOT NULL')
        .andWhere('lote.fecha_vencimiento <= :futureDate', { futureDate })
        .andWhere('lote.cantidad_actual > 0')
        .orderBy('lote.fecha_vencimiento', 'ASC')
        .getMany();

      // Separar por urgencia
      const today = new Date();
      const expiredBatches = expiringBatches.filter(batch => 
        batch.fecha_vencimiento && batch.fecha_vencimiento < today
      );
      
      const expiringThisWeek = expiringBatches.filter(batch => {
        if (!batch.fecha_vencimiento) return false;
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        return batch.fecha_vencimiento >= today && batch.fecha_vencimiento <= weekFromNow;
      });

      const expiringThisMonth = expiringBatches.filter(batch => {
        if (!batch.fecha_vencimiento) return false;
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        return batch.fecha_vencimiento > weekFromNow && batch.fecha_vencimiento <= futureDate;
      });

      // Calcular valores
      const totalValueAtRisk = {
        usd: expiringBatches.reduce((sum, batch) => sum + batch.valor_inventario_usd, 0),
        ves: expiringBatches.reduce((sum, batch) => sum + batch.valor_inventario_ves, 0)
      };

      res.json({
        success: true,
        data: {
          configuracion: {
            dias_adelante: Number(days),
            fecha_limite: futureDate
          },
          resumen: {
            total_lotes_por_vencer: expiringBatches.length,
            lotes_ya_vencidos: expiredBatches.length,
            lotes_vencen_esta_semana: expiringThisWeek.length,
            lotes_vencen_este_mes: expiringThisMonth.length,
            valor_en_riesgo: totalValueAtRisk
          },
          lotes_por_urgencia: {
            ya_vencidos: expiredBatches.map(batch => ({
              ...batch,
              dias_vencido: Math.floor((today.getTime() - batch.fecha_vencimiento!.getTime()) / (1000 * 60 * 60 * 24)),
              valor_perdido_usd: batch.valor_inventario_usd,
              valor_perdido_ves: batch.valor_inventario_ves
            })),
            vencen_esta_semana: expiringThisWeek.map(batch => ({
              ...batch,
              dias_restantes: Math.floor((batch.fecha_vencimiento!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            })),
            vencen_este_mes: expiringThisMonth.map(batch => ({
              ...batch,
              dias_restantes: Math.floor((batch.fecha_vencimiento!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            }))
          }
        }
      });
    } catch (error) {
      console.error('Error obteniendo productos por vencer:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
}