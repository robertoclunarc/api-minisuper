import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { InventoryBatch } from '../models/InventoryBatch';
import { Product } from '../models/Product';
import { CurrencyService } from '../services/currencyService';
import { batchEntrySchema, stockAdjustmentSchema } from '../validations/inventoryValidation';
import { AuthRequest } from '../middleware/auth';
import { Provider } from '../models/Provider';
import { User } from '../models/User';

export class InventoryController {
  private batchRepository = AppDataSource.getRepository(InventoryBatch);
  private productRepository = AppDataSource.getRepository(Product);
  private currencyService = new CurrencyService();
  private providerRepository = AppDataSource.getRepository(Provider);
  private userRepository = AppDataSource.getRepository(User);

  public createBatch = async (req: AuthRequest, res: Response) => {
    try {
      const { error, value } = batchEntrySchema.validate(req.body);
      if (error) {
        console.error( error.details.map(detail => detail.message))
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

  public getBatches = async (req: Request, res: Response) => {
    try {
      const { 
        page = 1, 
        limit = 25, 
        search, 
        producto_id, 
        proveedor_id,
        estado,
        fecha_vencimiento_desde,
        fecha_vencimiento_hasta
      } = req.query;

      console.log('📦 Getting inventory batches with filters:', {
        page, limit, search, producto_id, proveedor_id, estado,
        fecha_vencimiento_desde, fecha_vencimiento_hasta
      });

      const skip = (Number(page) - 1) * Number(limit);

      // ✅ QUERY CORREGIDO PARA LOTES DE INVENTARIO
      let queryBuilder = this.batchRepository
        .createQueryBuilder('lote')
        .leftJoinAndSelect('lote.producto', 'producto')
        .leftJoinAndSelect('lote.proveedor', 'proveedor')
        .leftJoinAndSelect('lote.usuario', 'usuario')
        .leftJoinAndSelect('producto.categoria', 'categoria')
        .orderBy('lote.fecha_ingreso', 'DESC')
        .addOrderBy('lote.numero_lote', 'ASC');

      // ✅ APLICAR FILTROS
      if (search) {
        queryBuilder = queryBuilder.andWhere(
          '(lote.numero_lote LIKE :search OR producto.nombre LIKE :search OR producto.codigo_barras LIKE :search)',
          { search: `%${search}%` }
        );
      }

      if (producto_id) {
        queryBuilder = queryBuilder.andWhere('lote.producto_id = :producto_id', { producto_id });
      }

      if (proveedor_id) {
        queryBuilder = queryBuilder.andWhere('lote.proveedor_id = :proveedor_id', { proveedor_id });
      }

      // ✅ FILTROS POR ESTADO
      if (estado) {
        const today = new Date().toISOString().split('T')[0];
        
        switch (estado) {
          case 'disponible':
            queryBuilder = queryBuilder
              .andWhere('lote.cantidad_actual > 0')
              .andWhere('(lote.fecha_vencimiento IS NULL OR lote.fecha_vencimiento > :today)', { today });
            break;
          case 'por_vencer':
            queryBuilder = queryBuilder
              .andWhere('lote.cantidad_actual > 0')
              .andWhere('lote.fecha_vencimiento IS NOT NULL')
              .andWhere('lote.fecha_vencimiento <= DATE_ADD(:today, INTERVAL 30 DAY)', { today })
              .andWhere('lote.fecha_vencimiento > :today', { today });
            break;
          case 'vencido':
            queryBuilder = queryBuilder
              .andWhere('lote.cantidad_actual > 0')
              .andWhere('lote.fecha_vencimiento IS NOT NULL')
              .andWhere('lote.fecha_vencimiento <= :today', { today });
            break;
        }
      }

      // ✅ FILTROS POR FECHA DE VENCIMIENTO
      if (fecha_vencimiento_desde) {
        queryBuilder = queryBuilder.andWhere(
          'lote.fecha_vencimiento >= :fecha_desde', 
          { fecha_desde: fecha_vencimiento_desde }
        );
      }

      if (fecha_vencimiento_hasta) {
        queryBuilder = queryBuilder.andWhere(
          'lote.fecha_vencimiento <= :fecha_hasta', 
          { fecha_hasta: fecha_vencimiento_hasta }
        );
      }

      // ✅ OBTENER TOTAL PARA PAGINACIÓN
      const total = await queryBuilder.getCount();

      // ✅ APLICAR PAGINACIÓN Y OBTENER RESULTADOS
      const batches = await queryBuilder
        .skip(skip)
        .take(Number(limit))
        .getMany();

      // ✅ TRANSFORMAR DATOS PARA EL FRONTEND
      const formattedBatches = batches.map(batch => ({
        id: batch.id,
        producto_id: batch.producto_id,
        proveedor_id: batch.proveedor_id,
        numero_lote: batch.numero_lote,
        cantidad_inicial: Number(batch.cantidad_inicial),
        cantidad_actual: Number(batch.cantidad_actual),
        precio_costo_usd: Number(batch.precio_costo_usd),
        tasa_cambio_registro: Number(batch.tasa_cambio_registro),
        fecha_vencimiento: batch.fecha_vencimiento,
        fecha_ingreso: batch.fecha_ingreso,
        usuario_id: batch.usuario_id,      
        
        // ✅ RELACIONES
        producto: batch.producto ? {
          id: batch.producto.id,
          codigo_barras: batch.producto.codigo_barras,
          codigo_interno: batch.producto.codigo_interno,
          nombre: batch.producto.nombre,
          descripcion: batch.producto.descripcion,
          categoria_id: batch.producto.categoria_id,
          proveedor_id: batch.producto.proveedor_id,
          precio_venta_usd: Number(batch.producto.precio_venta_usd),
          precio_costo_usd: Number(batch.producto.precio_costo_usd),
          stock_minimo: Number(batch.producto.stock_minimo),
          unidad_medida: batch.producto.unidad_medida,
          activo: batch.producto.activo,
          created_at: batch.producto.created_at,
          updated_at: batch.producto.updated_at,
          categoria: batch.producto.categoria
        } : undefined,
        
        proveedor: batch.proveedor ? {
          id: batch.proveedor.id,
          nombre: batch.proveedor.nombre,
          contacto: batch.proveedor.contacto,
          telefono: batch.proveedor.telefono,
          email: batch.proveedor.email,
          direccion: batch.proveedor.direccion,
          activo: batch.proveedor.activo,
          created_at: batch.proveedor.created_at
        } : undefined,
        
        usuario: batch.usuario ? {
          id: batch.usuario.id,
          nombre: batch.usuario.nombre,        
          rol: batch.usuario.rol
        } : undefined,
        
        // ✅ CAMPOS CALCULADOS
        valor_total_usd: Number(batch.cantidad_actual) * Number(batch.precio_costo_usd),
        dias_hasta_vencimiento: batch.fecha_vencimiento ? 
          Math.ceil((new Date(batch.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 
          null,
        estado: this.getEstadoLote(batch)
      }));

      // ✅ CALCULAR ESTADÍSTICAS
      const estadisticas = await this.calculateStatistics();

      console.log('✅ Inventory batches retrieved:', {
        total_batches: formattedBatches.length,
        total_items: total,
        page: Number(page)
      });

      res.json({
        success: true,
        data: {
          batches: formattedBatches,
          pagination: {
            current_page: Number(page),
            total_pages: Math.ceil(total / Number(limit)),
            total_items: total,
            items_per_page: Number(limit)
          },
          statistics: estadisticas
        }
      });

    } catch (error) {
      console.error('❌ Error getting inventory batches:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

private getEstadoLote(batch: any): 'disponible' | 'por_vencer' | 'vencido' | 'agotado' {
  const cantidadActual = Number(batch.cantidad_actual);

  if (cantidadActual <= 0) {
    return 'agotado';
  }

  if (batch.fecha_vencimiento) {
    const today = new Date();
    const expiryDate = new Date(batch.fecha_vencimiento);
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return 'vencido';
    } else if (daysUntilExpiry <= 30) {
      return 'por_vencer';
    }
  }

  return 'disponible';
}

// ✅ MÉTODO AUXILIAR PARA CALCULAR ESTADÍSTICAS
  private async calculateStatistics() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Estadísticas de lotes
      const totalLotes = await this.batchRepository.count();
      
      const lotesDisponibles = await this.batchRepository
        .createQueryBuilder('lote')
        .where('lote.cantidad_actual > 0')
        .andWhere('(lote.fecha_vencimiento IS NULL OR lote.fecha_vencimiento > :today)', { today })
        .getCount();
      
      const lotesPorVencer = await this.batchRepository
        .createQueryBuilder('lote')
        .where('lote.cantidad_actual > 0')
        .andWhere('lote.fecha_vencimiento IS NOT NULL')
        .andWhere('lote.fecha_vencimiento <= DATE_ADD(:today, INTERVAL 30 DAY)', { today })
        .andWhere('lote.fecha_vencimiento > :today', { today })
        .getCount();
      
      const lotesVencidos = await this.batchRepository
        .createQueryBuilder('lote')
        .where('lote.cantidad_actual > 0')
        .andWhere('lote.fecha_vencimiento IS NOT NULL')
        .andWhere('lote.fecha_vencimiento <= :today', { today })
        .getCount();
      
      // Valor total del inventario
      const valorInventarioResult = await this.batchRepository
        .createQueryBuilder('lote')
        .select('SUM(lote.cantidad_actual * lote.precio_costo_usd)', 'valor_total')
        .where('lote.cantidad_actual > 0')
        .getRawOne();
      
      const valorInventarioUSD = Number(valorInventarioResult?.valor_total) || 0;
      
      // Estadísticas de productos
      const totalProductos = await this.productRepository
        .createQueryBuilder('producto')
        .where('producto.activo = :activo', { activo: true })
        .getCount();
      
      return {
        total_productos: totalProductos,
        total_lotes: totalLotes,
        valor_inventario_usd: Number(valorInventarioUSD.toFixed(2)),
        productos_por_vencer: lotesPorVencer,
        productos_vencidos: lotesVencidos
      };
      
    } catch (error) {
      console.error('Error calculating statistics:', error);
      return {
        total_productos: 0,
        total_lotes: 0,
        valor_inventario_usd: 0,
        productos_por_vencer: 0,
        productos_vencidos: 0
      };
    }
  }

  public adjustStock = async (req: AuthRequest, res: Response) => {
    try {
      //console.log('📦 Adjusting stock with data:', req.body);
      const { error, value } = stockAdjustmentSchema.validate(req.body);
      if (error) {
        console.error('Validation error adjusting stock:', error.details.map(detail => detail.message));
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const { id, cantidad_actual, cantidad_inicial, product_id, proveedor_id, precio_costo_usd, tasa_cambio_registro, fecha_vencimiento, fecha_ingreso, numero_lote } = value;

      await this.batchRepository.update(Number(id), value);
      
      res.json({
        success: true,
        message: 'Inventario actualizado exitosamente',
        data: value
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