import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Sale, SaleStatus } from '../models/Sale';
import { PaymentDetail } from '../models/PaymentDetail';
import { SaleDetail } from '../models/SaleDetail';
import { Product } from '../models/Product';
import { InventoryBatch } from '../models/InventoryBatch';
import { CashRegisterClose, CashRegisterStatus } from '../models/CashRegisterClose';
import { CurrencyService } from '../services/currencyService';
import { createSaleSchema, cancelSaleSchema } from '../validations/saleValidation';
import { AuthRequest } from '../middleware/auth';

export class SaleController {
  private saleRepository = AppDataSource.getRepository(Sale);
  private saleDetailRepository = AppDataSource.getRepository(SaleDetail);
  private productRepository = AppDataSource.getRepository(Product);
  private batchRepository = AppDataSource.getRepository(InventoryBatch);
  private cashCloseRepository = AppDataSource.getRepository(CashRegisterClose);
  private currencyService = new CurrencyService();

  public createSale = async (req: AuthRequest, res: Response) => {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const { error, value } = createSaleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Datos de entrada inválidos',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { 
      caja_id, 
      items, 
      pagos, // ✅ RECIBIR ARRAY DE PAGOS
      descuento_usd = 0,
      descuento_ves = 0
    } = value;

    console.log('💳 Creating sale with multiple payments:', { caja_id, items, pagos });

    // Verificar que el usuario tiene una caja abierta
    const openCash = await this.cashCloseRepository.findOne({
      where: { 
        usuario_id: req.user!.id,
        caja_id: caja_id,
        estado: CashRegisterStatus.OPEN 
      },
      relations: ['caja']
    });

    if (!openCash) {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({
        success: false,
        message: 'No tienes una caja abierta o no coincide con la caja seleccionada'
      });
    }

    // Obtener tasa de cambio actual
    const exchangeRate = await this.currencyService.getCurrentExchangeRate();

    // ✅ VALIDAR PAGOS
    let totalPagadoUSD = 0;
    let totalPagadoVES = 0;
    const metodosUsados: string[] = [];

    for (const pago of pagos) {
      if (pago.monto_usd <= 0 && pago.monto_ves <= 0) {
        await queryRunner.rollbackTransaction();
        return res.status(400).json({
          success: false,
          message: 'Cada forma de pago debe tener un monto mayor a 0'
        });
      }
      
      totalPagadoUSD += pago.monto_usd;
      totalPagadoVES += pago.monto_ves;
      metodosUsados.push(pago.metodo_pago);
    }

    // Procesar productos (mantener lógica FIFO existente)
    const saleDetails = [];
    let subtotalUSD = 0;
    let subtotalVES = 0;

    for (const item of items) {
      const product = await this.productRepository.findOne({
        where: { id: item.producto_id, activo: true }
      });

      if (!product) {
        await queryRunner.rollbackTransaction();
        return res.status(404).json({
          success: false,
          message: `Producto con ID ${item.producto_id} no encontrado`
        });
      }

      const availableBatches = await this.batchRepository
        .createQueryBuilder('lote')
        .where('lote.producto_id = :producto_id', { producto_id: item.producto_id })
        .andWhere('lote.cantidad_actual > 0')
        .orderBy('ISNULL(lote.fecha_vencimiento)', 'ASC')
        .addOrderBy('lote.fecha_vencimiento', 'ASC')
        .addOrderBy('lote.fecha_ingreso', 'ASC')
        .getMany();

      const totalAvailable = availableBatches.reduce((sum, batch) => sum + batch.cantidad_actual, 0);

      if (totalAvailable < item.cantidad) {
        await queryRunner.rollbackTransaction();
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente para ${product.nombre}. Disponible: ${totalAvailable}, Solicitado: ${item.cantidad}`
        });
      }

      // Procesar venta con FIFO (mantener lógica existente)
      let cantidadRestante = item.cantidad;
      const batchesUsed = [];

      for (const batch of availableBatches) {
        if (cantidadRestante <= 0) break;

        const cantidadDeLote = Math.min(cantidadRestante, batch.cantidad_actual);
        
        if (cantidadDeLote > 0) {
          batchesUsed.push({
            lote: batch,
            cantidad: cantidadDeLote
          });

          batch.cantidad_actual -= cantidadDeLote;
          await queryRunner.manager.save(InventoryBatch, batch);
          cantidadRestante -= cantidadDeLote;
        }
      }

      // Crear detalles de venta
      for (const batchUsed of batchesUsed) {
        const precioUnitarioUSD = product.precio_venta_usd;
        const precioUnitarioVES = precioUnitarioUSD * exchangeRate;
        const subtotalItemUSD = precioUnitarioUSD * batchUsed.cantidad;
        const subtotalItemVES = precioUnitarioVES * batchUsed.cantidad;

        saleDetails.push({
          producto_id: product.id,
          lote_id: batchUsed.lote.id,
          cantidad: batchUsed.cantidad,
          precio_unitario_usd: precioUnitarioUSD,
          precio_unitario_ves: precioUnitarioVES,
          subtotal_usd: subtotalItemUSD,
          subtotal_ves: subtotalItemVES
        });

        subtotalUSD += subtotalItemUSD;
        subtotalVES += subtotalItemVES;
      }
    }

    // Aplicar descuentos
    const subtotalConDescuentoUSD = subtotalUSD - descuento_usd;
    const subtotalConDescuentoVES = subtotalVES - descuento_ves;

    // Calcular impuestos (16% IVA)
    const taxRate = 0.16;
    const impuestoUSD = subtotalConDescuentoUSD * taxRate;
    const impuestoVES = subtotalConDescuentoVES * taxRate;

    // Total final
    const totalUSD = subtotalConDescuentoUSD + impuestoUSD;
    const totalVES = subtotalConDescuentoVES + impuestoVES;

    // ✅ VALIDAR QUE EL PAGO SEA SUFICIENTE
    const totalRecibidoEnUSD = totalPagadoUSD + (totalPagadoVES / exchangeRate);
    
    if (totalRecibidoEnUSD < totalUSD) {
      await queryRunner.rollbackTransaction();
      return res.status(400).json({
        success: false,
        message: `Pago insuficiente. Total: $${totalUSD.toFixed(2)}, Recibido: $${totalRecibidoEnUSD.toFixed(2)}`
      });
    }

    // ✅ CALCULAR CAMBIO
    const cambioUSD = totalRecibidoEnUSD - totalUSD;
    const cambioVES = cambioUSD * exchangeRate;

    // ✅ CREAR RESUMEN DE MÉTODOS DE PAGO
    const metodosUnicos = [...new Set(metodosUsados)];
    const resumenMetodos = metodosUnicos.length > 1 ? 'mixto' : (metodosUnicos[0] ?? 'desconocido');

    // Crear la venta
    const sale = queryRunner.manager.create(Sale, {
      numero_venta: await this.generateSaleNumber(),
      usuario_id: req.user!.id,
      caja_id: caja_id,
      cierre_caja_id: openCash.id,
      subtotal_usd: subtotalUSD,
      subtotal_ves: subtotalVES,
      descuento_usd,
      descuento_ves,
      impuesto_usd: impuestoUSD,
      impuesto_ves: impuestoVES,
      total_usd: totalUSD,
      total_ves: totalVES,
      metodo_pago: resumenMetodos, // ✅ RESUMEN DE MÉTODOS (siempre string)
      monto_recibido_usd: totalPagadoUSD,
      monto_recibido_ves: totalPagadoVES,
      cambio_usd: cambioUSD,
      cambio_ves: cambioVES,
      tasa_cambio_venta: exchangeRate,
      estado: SaleStatus.COMPLETED
    });

    const savedSale = await queryRunner.manager.save(Sale, sale);

    // ✅ CREAR DETALLES DE PAGO
    for (const pago of pagos) {
      const paymentDetail = queryRunner.manager.create(PaymentDetail, {
        venta_id: savedSale.id,
        metodo_pago: pago.metodo_pago,
        monto_usd: pago.monto_usd,
        monto_ves: pago.monto_ves,
        referencia: pago.referencia,
        observaciones: pago.observaciones
      });
      await queryRunner.manager.save(PaymentDetail, paymentDetail);
    }

    // Crear detalles de venta (mantener lógica existente)
    for (const detail of saleDetails) {
      const saleDetail = queryRunner.manager.create(SaleDetail, {
        ...detail,
        venta_id: savedSale.id
      });
      await queryRunner.manager.save(SaleDetail, saleDetail);
    }

    // Actualizar estadísticas del cierre de caja
    await queryRunner.manager.update(CashRegisterClose, openCash.id, {
      total_ventas: () => `total_ventas + ${totalUSD}`,
      total_transacciones: () => 'total_transacciones + 1'
    });

    await queryRunner.commitTransaction();

    // Obtener venta completa para respuesta
    const completeSale = await this.saleRepository
      .createQueryBuilder('venta')
      .leftJoinAndSelect('venta.detalles', 'detalles')
      .leftJoinAndSelect('detalles.producto', 'producto')
      .leftJoinAndSelect('detalles.lote', 'lote')
      .leftJoinAndSelect('venta.detalle_pagos', 'pagos') // ✅ INCLUIR PAGOS
      .leftJoinAndSelect('venta.usuario', 'usuario')
      .leftJoinAndSelect('venta.caja', 'caja')
      .where('venta.id = :id', { id: savedSale.id })
      .getOne();

    res.status(201).json({
      success: true,
      message: 'Venta con pagos múltiples creada exitosamente',
      data: {
        venta: completeSale,
        cambio: {
          usd: cambioUSD,
          ves: cambioVES
        },
        resumen_pagos: pagos,
        tasa_cambio: exchangeRate
      }
    });

  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Error creando venta:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  } finally {
    await queryRunner.release();
  }
};

  public getSales = async (req: Request, res: Response) => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        fecha_inicio, 
        fecha_fin, 
        metodo_pago, 
        estado,
        usuario_id 
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      
      const queryBuilder = this.saleRepository
        .createQueryBuilder('venta')
        .leftJoinAndSelect('venta.usuario', 'usuario')
        .leftJoinAndSelect('venta.caja', 'caja')
        .leftJoinAndSelect('venta.detalles', 'detalles')
        .leftJoinAndSelect('detalles.producto', 'producto');

      if (fecha_inicio) {
        queryBuilder.andWhere('DATE(venta.fecha_venta) >= :fecha_inicio', { fecha_inicio });
      }

      if (fecha_fin) {
        queryBuilder.andWhere('DATE(venta.fecha_venta) <= :fecha_fin', { fecha_fin });
      }

      if (metodo_pago) {
        queryBuilder.andWhere('venta.metodo_pago = :metodo_pago', { metodo_pago });
      }

      if (estado) {
        queryBuilder.andWhere('venta.estado = :estado', { estado });
      }

      if (usuario_id) {
        queryBuilder.andWhere('venta.usuario_id = :usuario_id', { usuario_id });
      }

      const [sales, total] = await queryBuilder
        .orderBy('venta.fecha_venta', 'DESC')
        .skip(skip)
        .take(Number(limit))
        .getManyAndCount();

      // Agregar estadísticas
      const stats = {
        total_ventas_usd: sales.reduce((sum, sale) => sum + sale.total_usd, 0),
        total_ventas_ves: sales.reduce((sum, sale) => sum + sale.total_ves, 0),
        promedio_venta_usd: sales.length > 0 ? sales.reduce((sum, sale) => sum + sale.total_usd, 0) / sales.length : 0
      };

      res.json({
        success: true,
        data: {
          ventas: sales,
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
      console.error('Error obteniendo ventas:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getDailySales = async (req: AuthRequest, res: Response) => {
    try {
      const { fecha = new Date().toISOString().split('T')[0] } = req.query;

      const sales = await this.saleRepository
        .createQueryBuilder('venta')
        .leftJoinAndSelect('venta.usuario', 'usuario')
        .leftJoinAndSelect('venta.caja', 'caja')
        .leftJoinAndSelect('venta.detalles', 'detalles')
        .leftJoinAndSelect('detalles.producto', 'producto')
        .where('DATE(venta.fecha_venta) = :fecha', { fecha })
        .orderBy('venta.fecha_venta', 'DESC')
        .getMany();

      // Estadísticas del día
      const stats = {
        total_ventas: sales.length,
        total_ingresos_usd: sales.reduce((sum, sale) => sum + sale.total_usd, 0),
        total_ingresos_ves: sales.reduce((sum, sale) => sum + sale.total_ves, 0),
        promedio_venta_usd: sales.length > 0 ? sales.reduce((sum, sale) => sum + sale.total_usd, 0) / sales.length : 0,
        ventas_por_metodo: {
          efectivo_usd: sales.filter(s => s.metodo_pago === 'efectivo_usd').length,
          efectivo_ves: sales.filter(s => s.metodo_pago === 'efectivo_ves').length,
          tarjeta: sales.filter(s => s.metodo_pago === 'tarjeta').length,
          transferencia: sales.filter(s => s.metodo_pago === 'transferencia').length,
          pago_movil: sales.filter(s => s.metodo_pago === 'pago_movil').length,
          mixto: sales.filter(s => s.metodo_pago === 'mixto').length
        },
        productos_vendidos: sales.reduce((sum, sale) => 
          sum + sale.detalles.reduce((detailSum, detail) => detailSum + detail.cantidad, 0), 0
        )
      };

      res.json({
        success: true,
        data: {
          fecha,
          ventas: sales,
          estadisticas: stats
        }
      });

    } catch (error) {
      console.error('Error obteniendo ventas del día:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getSaleById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const sale = await this.saleRepository
        .createQueryBuilder('venta')
        .leftJoinAndSelect('venta.detalles', 'detalles')
        .leftJoinAndSelect('detalles.producto', 'producto')
        .leftJoinAndSelect('detalles.lote', 'lote')
        .leftJoinAndSelect('venta.usuario', 'usuario')
        .leftJoinAndSelect('venta.caja', 'caja')
        .where('venta.id = :id', { id })
        .getOne();

      if (!sale) {
        return res.status(404).json({
          success: false,
          message: 'Venta no encontrada'
        });
      }

      // Calcular ganancias
      const ganancias = sale.detalles.map(detail => ({
        producto: detail.producto.nombre,
        cantidad: detail.cantidad,
        precio_venta_usd: detail.precio_unitario_usd,
        precio_costo_usd: detail.lote?.precio_costo_usd || 0,
        ganancia_unitaria_usd: detail.ganancia_unitaria_usd,
        ganancia_total_usd: detail.ganancia_total_usd,
        margen_porcentaje: detail.margen_ganancia
      }));

      const gananciaTotalUSD = ganancias.reduce((sum, g) => sum + g.ganancia_total_usd, 0);

      res.json({
        success: true,
        data: {
          venta: sale,
          analisis_ganancias: {
            ganancia_total_usd: gananciaTotalUSD,
            ganancia_total_ves: gananciaTotalUSD * sale.cambio_ves,
            margen_promedio: ganancias.length > 0 ? 
              ganancias.reduce((sum, g) => sum + g.margen_porcentaje, 0) / ganancias.length : 0,
            detalle_ganancias: ganancias
          }
        }
      });

    } catch (error) {
      console.error('Error obteniendo venta:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getSaleReceipt = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const sale = await this.saleRepository
        .createQueryBuilder('venta')
        .leftJoinAndSelect('venta.detalles', 'detalles')
        .leftJoinAndSelect('detalles.producto', 'producto')
        .leftJoinAndSelect('venta.usuario', 'usuario')
        .leftJoinAndSelect('venta.caja', 'caja')
        .where('venta.id = :id', { id })
        .getOne();

      if (!sale) {
        return res.status(404).json({
          success: false,
          message: 'Venta no encontrada'
        });
      }

      // Generar recibo
      const receipt = {
        empresa: {
          nombre: 'Sistema POS Minisuper',
          direccion: 'Dirección de la empresa',
          telefono: 'Teléfono de contacto',
          rif: 'RIF de la empresa'
        },
        venta: {
          numero: sale.numero_venta,
          fecha: sale.fecha_venta,
          cajero: sale.usuario.nombre,
          caja: sale.caja.nombre
        },
        items: sale.detalles.map(detail => ({
          codigo: detail.producto.codigo_barras,
          nombre: detail.producto.nombre,
          cantidad: Number(detail.cantidad),
          // ✅ ASEGURAR QUE SEAN NÚMEROS
          precio_unitario_usd: Number(detail.precio_unitario_usd),
          precio_unitario_ves: Number(detail.precio_unitario_ves),
          subtotal_usd: Number(detail.subtotal_usd),
          subtotal_ves: Number(detail.subtotal_ves)
        })),
        totales: {
          // ✅ ASEGURAR QUE SEAN NÚMEROS
          subtotal_usd: Number(sale.subtotal_usd),
          subtotal_ves: Number(sale.subtotal_ves),
          descuento_usd: Number(sale.descuento_usd),
          descuento_ves: Number(sale.descuento_ves),
          impuesto_usd: Number(sale.impuesto_usd),
          impuesto_ves: Number(sale.impuesto_ves),
          total_usd: Number(sale.total_usd),
          total_ves: Number(sale.total_ves)
        },
        pago: {
          metodo: sale.metodo_pago,
          // ✅ ASEGURAR QUE SEAN NÚMEROS
          recibido_usd: Number(sale.monto_recibido_usd),
          recibido_ves: Number(sale.monto_recibido_ves),
          cambio_usd: Number(sale.cambio_usd),
          cambio_ves: Number(sale.cambio_ves),
          tasa_cambio: Number(sale.tasa_cambio_venta || sale.tasa_cambio || 1)
        },
        footer: {
          mensaje: 'Gracias por su compra',
          fecha_impresion: new Date()
        }
      };

      console.log('🧾 Generated receipt data:', receipt);
      res.json({
        success: true,
        data: receipt
      });

    } catch (error) {
      console.error('Error generando recibo:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public cancelSale = async (req: AuthRequest, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { id } = req.params;
      const { error, value } = cancelSaleSchema.validate(req.body);

      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const { motivo } = value;

      const sale = await this.saleRepository.findOne({
        where: { id: Number(id) },
        relations: ['detalles', 'detalles.lote']
      });

      if (!sale) {
        await queryRunner.rollbackTransaction();
        return res.status(404).json({
          success: false,
          message: 'Venta no encontrada'
        });
      }

      if (sale.estado === SaleStatus.CANCELED) {
        await queryRunner.rollbackTransaction();
        return res.status(400).json({
          success: false,
          message: 'La venta ya está cancelada'
        });
      }

      // Restaurar stock de los lotes
      for (const detail of sale.detalles) {
        if (detail.lote) {
          await queryRunner.manager.update(InventoryBatch, detail.lote.id, {
            cantidad_actual: () => `cantidad_actual + ${detail.cantidad}`
          });
        }
      }

      // Actualizar la venta
      await queryRunner.manager.update(Sale, id, {
        estado: SaleStatus.CANCELED,
       // motivoCancelacion: motivo,
       // fechaCancelacion: new Date(),
       // canceladoPor: req.user!.id
      });

      // Actualizar estadísticas del cierre de caja
      if (sale.cierre_caja_id) {
        await queryRunner.manager.update(CashRegisterClose, sale.cierre_caja_id, {
          total_ventas: () => `total_ventas - ${sale.total_usd}`,
          total_transacciones: () => 'total_transacciones - 1'
        });
      }

      await queryRunner.commitTransaction();

      res.json({
        success: true,
        message: 'Venta cancelada exitosamente',
        data: {
          venta_id: sale.id,
          numero_venta: sale.numero_venta,
          monto_reembolsado_usd: sale.total_usd,
          monto_reembolsado_ves: sale.total_ves,
          motivo,
          fecha_cancelacion: new Date(),
          cancelado_por: req.user!.nombre
        }
      });

    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error cancelando venta:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    } finally {
      await queryRunner.release();
    }
  };

  private async generateSaleNumber(): Promise<string> {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const prefix = `${year}${month}${day}`;
    
    const lastSale = await this.saleRepository
      .createQueryBuilder('venta')
      .where('venta.numero_venta LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('venta.numero_venta', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastSale) {
      const lastSequence = parseInt(lastSale.numero_venta.substring(8));
      sequence = lastSequence + 1;
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }
}