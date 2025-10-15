import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { CashRegisterClose, CashRegisterStatus } from '../models/CashRegisterClose';
import { AuthRequest } from '../middleware/auth';
import { Sale } from '../models/Sale';
import { SaleDetail } from '../models/SaleDetail';
import Joi from 'joi';

export class ReportController {
  private cashCloseRepository = AppDataSource.getRepository(CashRegisterClose);
  private saleRepository = AppDataSource.getRepository(Sale);
  private saleDetailRepository = AppDataSource.getRepository(SaleDetail);

  public openCashRegister = async (req: AuthRequest, res: Response) => {
    try {
      const { caja_id, monto_inicial = 0 } = req.body;

      // Verificar que no hay una caja ya abierta
      const existingOpen = await this.cashCloseRepository.findOne({
        where: { 
          caja_id, 
          estado: CashRegisterStatus.OPEN,
        }
      });

      if (existingOpen) {
        return res.status(400).json({
          success: false,
          message: 'Ya hay una caja abierta'
        });
      }

      const cashClose = this.cashCloseRepository.create({
        caja_id,
        usuario_id: req.user!.id,
        monto_inicial_ves: 0,
        monto_final_ves: 0,
        estado: CashRegisterStatus.OPEN,
      });

      await this.cashCloseRepository.save(cashClose);

      res.status(201).json({
        success: true,
        message: 'Caja abierta exitosamente',
        data: cashClose
      });
    } catch (error) {
      console.error('Error abriendo caja:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public closeCashRegister = async (req: AuthRequest, res: Response) => {
    try {
      const { caja_id, monto_final_usd, monto_final_ves, observaciones } = req.body;

      const openCash = await this.cashCloseRepository.findOne({
        where: { 
          caja_id, 
          estado: CashRegisterStatus.OPEN,
          usuario_id: req.user!.id 
        },
        relations: ['ventas']
      });

      if (!openCash) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró una caja abierta'
        });
      }

      // Actualizar cierre
      await this.cashCloseRepository.update(openCash.id, {
        fecha_cierre: new Date(),
        monto_final_usd,
        monto_final_ves,
        observaciones,
        estado: CashRegisterStatus.CLOSED
      });

      // Obtener el cierre actualizado con detalles
      const closedCash = await this.cashCloseRepository
        .createQueryBuilder('cierre')
        .leftJoinAndSelect('cierre.ventas', 'ventas')
        .leftJoinAndSelect('cierre.usuario', 'usuario')
        .leftJoinAndSelect('cierre.caja', 'caja')
        .where('cierre.id = :id', { id: openCash.id })
        .getOne();

      res.json({
        success: true,
        message: 'Caja cerrada exitosamente',
        data: closedCash
      });
    } catch (error) {
      console.error('Error cerrando caja:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getCashRegisterStatus = async (req: Request, res: Response) => {
    try {
      const { caja_id } = req.params;

      const openCash = await this.cashCloseRepository.findOne({
        where: { 
          caja_id: Number(caja_id), 
          estado: CashRegisterStatus.OPEN 
        },
        relations: ['usuario', 'caja']
      });

      res.json({
        success: true,
        data: {
          is_open: !!openCash,
          cash_register: openCash
        }
      });
    } catch (error) {
      console.error('Error obteniendo estado de caja:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getDailyReport = async (req: Request, res: Response) => {
    try {
      const { fecha = new Date().toISOString().split('T')[0] } = req.query;

      const reportQuery = `
        SELECT 
          p.codigo_barras,
          p.nombre as producto,
          c.nombre as categoria,
          SUM(dv.cantidad) as cantidad_vendida,
          SUM(dv.subtotal) as monto_total,
          AVG(dv.precio_unitario) as precio_promedio,
          COUNT(DISTINCT v.id) as numero_transacciones
        FROM detalle_ventas dv
        JOIN ventas v ON dv.venta_id = v.id
        JOIN productos p ON dv.producto_id = p.id
        LEFT JOIN categorias c ON p.categoria_id = c.id
        WHERE DATE(v.fecha_venta) = ? 
        AND v.estado = 'completada'
        GROUP BY p.id
        ORDER BY cantidad_vendida DESC
      `;

      const productSales = await AppDataSource.query(reportQuery, [fecha]);

      const summaryQuery = `
        SELECT 
          COUNT(*) as total_ventas,
          SUM(total) as monto_total,
          SUM(subtotal) as subtotal_total,
          SUM(impuesto) as impuesto_total,
          SUM(descuento) as descuento_total,
          AVG(total) as venta_promedio,
          SUM(CASE WHEN metodo_pago = 'efectivo' THEN total ELSE 0 END) as efectivo,
          SUM(CASE WHEN metodo_pago = 'tarjeta' THEN total ELSE 0 END) as tarjeta,
          SUM(CASE WHEN metodo_pago = 'transferencia' THEN total ELSE 0 END) as transferencia
        FROM ventas 
        WHERE DATE(fecha_venta) = ? 
        AND estado = 'completada'
      `;

      const [summary] = await AppDataSource.query(summaryQuery, [fecha]);

      res.json({
        success: true,
        data: {
          fecha,
          resumen: summary,
          ventas_por_producto: productSales
        }
      });
    } catch (error) {
      console.error('Error generando reporte diario:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getProductSalesReport = async (req: Request, res: Response) => {
    try {
      const { 
        fecha_inicio, 
        fecha_fin, 
        producto_id,
        categoria_id,
        limit = 50 
      } = req.query;

      let query = `
        SELECT 
          p.id,
          p.codigo_barras,
          p.nombre as producto,
          c.nombre as categoria,
          pr.nombre as proveedor,
          SUM(dv.cantidad) as total_vendido,
          SUM(dv.subtotal) as monto_total,
          COUNT(DISTINCT v.id) as numero_transacciones,
          AVG(dv.precio_unitario) as precio_promedio,
          MIN(v.fecha_venta) as primera_venta,
          MAX(v.fecha_venta) as ultima_venta
        FROM detalle_ventas dv
        JOIN ventas v ON dv.venta_id = v.id
        JOIN productos p ON dv.producto_id = p.id
        LEFT JOIN categorias c ON p.categoria_id = c.id
        LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
        WHERE v.estado = 'completada'
      `;

      const params: any[] = [];

      if (fecha_inicio) {
        query += ' AND DATE(v.fecha_venta) >= ?';
        params.push(fecha_inicio);
      }

      if (fecha_fin) {
        query += ' AND DATE(v.fecha_venta) <= ?';
        params.push(fecha_fin);
      }

      if (producto_id) {
        query += ' AND p.id = ?';
        params.push(producto_id);
      }

      if (categoria_id) {
        query += ' AND p.categoria_id = ?';
        params.push(categoria_id);
      }

      query += `
        GROUP BY p.id
        ORDER BY total_vendido DESC
        LIMIT ?
      `;
      params.push(Number(limit));

      const productSales = await AppDataSource.query(query, params);

      res.json({
        success: true,
        data: {
          productos_vendidos: productSales,
          periodo: {
            fecha_inicio: fecha_inicio || 'Sin límite',
            fecha_fin: fecha_fin || 'Sin límite'
          }
        }
      });
    } catch (error) {
      console.error('Error generando reporte de productos:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getCashierReport = async (req: Request, res: Response) => {
    try {
      const { 
        usuario_id, 
        fecha_inicio, 
        fecha_fin 
      } = req.query;

      let query = `
        SELECT 
          u.id,
          u.nombre as cajero,
          COUNT(v.id) as total_ventas,
          SUM(v.total) as monto_total,
          AVG(v.total) as venta_promedio,
          MIN(v.fecha_venta) as primera_venta,
          MAX(v.fecha_venta) as ultima_venta,
          COUNT(DISTINCT DATE(v.fecha_venta)) as dias_trabajados
        FROM ventas v
        JOIN usuarios u ON v.usuario_id = u.id
        WHERE v.estado = 'completada'
      `;

      const params: any[] = [];

      if (usuario_id) {
        query += ' AND u.id = ?';
        params.push(usuario_id);
      }

      if (fecha_inicio) {
        query += ' AND DATE(v.fecha_venta) >= ?';
        params.push(fecha_inicio);
      }

      if (fecha_fin) {
        query += ' AND DATE(v.fecha_venta) <= ?';
        params.push(fecha_fin);
      }

      query += ' GROUP BY u.id ORDER BY monto_total DESC';

      const cashierSales = await AppDataSource.query(query, params);

      res.json({
        success: true,
        data: {
          reporte_cajeros: cashierSales,
          periodo: {
            fecha_inicio: fecha_inicio || 'Sin límite',
            fecha_fin: fecha_fin || 'Sin límite'
          }
        }
      });
    } catch (error) {
      console.error('Error generando reporte de cajeros:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
  // Validación para reportes de ventas
  private salesReportSchema = Joi.object({
    fecha_inicio: Joi.date().required().messages({
      'date.base': 'Fecha de inicio debe ser una fecha válida',
      'any.required': 'Fecha de inicio es requerida'
    }),
    fecha_fin: Joi.date().min(Joi.ref('fecha_inicio')).required().messages({
      'date.base': 'Fecha de fin debe ser una fecha válida',
      'date.min': 'Fecha de fin debe ser mayor o igual a fecha de inicio',
      'any.required': 'Fecha de fin es requerida'
    }),
    categoria_id: Joi.number().integer().positive().optional(),
    proveedor_id: Joi.number().integer().positive().optional(),
    metodo_pago: Joi.string().valid(
      'efectivo_usd', 'efectivo_ves', 'tarjeta', 
      'transferencia', 'pago_movil', 'mixto'
    ).optional(),
    usuario_id: Joi.number().integer().positive().optional(),
    // ✅ NUEVOS FILTROS
    producto_codigo: Joi.string().trim().max(50).optional().messages({
      'string.max': 'El código no puede exceder 50 caracteres'
    }),
    producto_descripcion: Joi.string().trim().max(200).optional().messages({
      'string.max': 'La descripción no puede exceder 200 caracteres'
    })
  });

  public getSalesReportByProduct = async (req: AuthRequest, res: Response) => {
    try {
      const { error, value } = this.salesReportSchema.validate(req.query);
      
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const { 
        fecha_inicio, 
        fecha_fin, 
        categoria_id, 
        proveedor_id, 
        metodo_pago,
        usuario_id,
        producto_codigo,        // ✅ NUEVO
        producto_descripcion    // ✅ NUEVO
      } = value;

      console.log('📊 Generating sales report by product:', {
        fecha_inicio,
        fecha_fin,
        filters: { 
          categoria_id, 
          proveedor_id, 
          metodo_pago, 
          usuario_id,
          producto_codigo,
          producto_descripcion
        }
      });

      // Query principal para obtener ventas por producto
      let query = this.saleDetailRepository
        .createQueryBuilder('detalle')
        .innerJoin('detalle.venta', 'venta')
        .innerJoin('detalle.producto', 'producto')
        .leftJoin('producto.categoria', 'categoria')
        .leftJoin('producto.proveedor', 'proveedor')
        .leftJoin('venta.usuario', 'usuario')
        .select([
          'producto.id as producto_id',
          'producto.codigo_barras as codigo_barras',
          'producto.nombre as producto_nombre',
          'categoria.nombre as categoria_nombre',
          'proveedor.nombre as proveedor_nombre',
          'SUM(detalle.cantidad) as total_cantidad',
          'AVG(detalle.precio_unitario_usd) as precio_promedio_usd',
          'SUM(detalle.subtotal_usd) as total_ventas_usd',
          'SUM(detalle.subtotal_ves) as total_ventas_ves',
          'COUNT(DISTINCT venta.id) as numero_transacciones',
          'MIN(venta.fecha_venta) as primera_venta',
          'MAX(venta.fecha_venta) as ultima_venta'
        ])
        .where('DATE(venta.fecha_venta) >= :fecha_inicio', { fecha_inicio })
        .andWhere('DATE(venta.fecha_venta) <= :fecha_fin', { fecha_fin })
        .andWhere('venta.estado = :estado', { estado: 'completada' });

      // Aplicar filtros opcionales existentes...
      if (categoria_id) {
        query = query.andWhere('producto.categoria_id = :categoria_id', { categoria_id });
      }

      if (proveedor_id) {
        query = query.andWhere('producto.proveedor_id = :proveedor_id', { proveedor_id });
      }

      if (metodo_pago) {
        if (metodo_pago === 'mixto') {
          query = query.andWhere('venta.metodo_pago = :metodo_pago', { metodo_pago });
        } else {
          query = query.andWhere(
            '(venta.metodo_pago = :metodo_pago OR venta.metodo_pago LIKE :metodo_like)',
            { metodo_pago, metodo_like: `%${metodo_pago}%` }
          );
        }
      }

      if (usuario_id) {
        query = query.andWhere('venta.usuario_id = :usuario_id', { usuario_id });
      }

      // ✅ NUEVOS FILTROS DE PRODUCTO
      if (producto_codigo) {
        query = query.andWhere('producto.codigo_barras LIKE :producto_codigo', { 
          producto_codigo: `%${producto_codigo}%` 
        });
      }

      if (producto_descripcion) {
        query = query.andWhere('producto.nombre LIKE :producto_descripcion', { 
          producto_descripcion: `%${producto_descripcion}%` 
        });
      }

      const productSales = await query
        .groupBy('producto.id')
        .addGroupBy('producto.codigo_barras')
        .addGroupBy('producto.nombre')
        .addGroupBy('categoria.nombre')
        .addGroupBy('proveedor.nombre')
        .orderBy('total_ventas_usd', 'DESC')
        .getRawMany();

      const totalsQuery = this.saleDetailRepository
        .createQueryBuilder('detalle')
        .innerJoin('detalle.venta', 'venta')
        .innerJoin('detalle.producto', 'producto')
        .select([
          'SUM(detalle.cantidad) as total_productos_vendidos',
          'SUM(detalle.subtotal_usd) as total_ventas_usd',
          'SUM(detalle.subtotal_ves) as total_ventas_ves',
          'COUNT(DISTINCT venta.id) as total_transacciones',
          'COUNT(DISTINCT producto.id) as productos_diferentes',
          'AVG(venta.total_usd) as ticket_promedio_usd'
        ])
        .where('DATE(venta.fecha_venta) >= :fecha_inicio', { fecha_inicio })
        .andWhere('DATE(venta.fecha_venta) <= :fecha_fin', { fecha_fin })
        .andWhere('venta.estado = :estado', { estado: 'completada' });

      // Aplicar los mismos filtros a totales
      if (categoria_id) {
        totalsQuery.andWhere('producto.categoria_id = :categoria_id', { categoria_id });
      }
      if (proveedor_id) {
        totalsQuery.andWhere('producto.proveedor_id = :proveedor_id', { proveedor_id });
      }
      if (metodo_pago) {
        if (metodo_pago === 'mixto') {
          totalsQuery.andWhere('venta.metodo_pago = :metodo_pago', { metodo_pago });
        } else {
          totalsQuery.andWhere(
            '(venta.metodo_pago = :metodo_pago OR venta.metodo_pago LIKE :metodo_like)',
            { metodo_pago, metodo_like: `%${metodo_pago}%` }
          );
        }
      }
      if (usuario_id) {
        totalsQuery.andWhere('venta.usuario_id = :usuario_id', { usuario_id });
      }
      // ✅ APLICAR FILTROS DE PRODUCTO A TOTALES
      if (producto_codigo) {
        totalsQuery.andWhere('producto.codigo_barras LIKE :producto_codigo', { 
          producto_codigo: `%${producto_codigo}%` 
        });
      }
      if (producto_descripcion) {
        totalsQuery.andWhere('producto.nombre LIKE :producto_descripcion', { 
          producto_descripcion: `%${producto_descripcion}%` 
        });
      }

      const totals = await totalsQuery.getRawOne();

      const topProducts = productSales.slice(0, 5);
      const lowProducts = productSales.slice(-5).reverse();

      const totalDias = Math.ceil(
        (new Date(fecha_fin).getTime() - new Date(fecha_inicio).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

      const estadisticas = {
        periodo: {
          fecha_inicio,
          fecha_fin,
          total_dias: totalDias
        },
        totales: {
          total_productos_vendidos: Number(totals.total_productos_vendidos) || 0,
          total_ventas_usd: Number(totals.total_ventas_usd) || 0,
          total_ventas_ves: Number(totals.total_ventas_ves) || 0,
          total_transacciones: Number(totals.total_transacciones) || 0,
          productos_diferentes: Number(totals.productos_diferentes) || 0,
          ticket_promedio_usd: Number(totals.ticket_promedio_usd) || 0
        },
        promedios: {
          ventas_por_dia_usd: Number(totals.total_ventas_usd) / totalDias || 0,
          productos_por_dia: Number(totals.total_productos_vendidos) / totalDias || 0,
          transacciones_por_dia: Number(totals.total_transacciones) / totalDias || 0
        },
        rankings: {
          productos_mas_vendidos: topProducts,
          productos_menos_vendidos: lowProducts
        }
      };

      const productosFormateados = productSales.map(product => ({
        producto_id: product.producto_id,
        codigo_barras: product.codigo_barras,
        producto_nombre: product.producto_nombre,
        categoria_nombre: product.categoria_nombre || 'Sin categoría',
        proveedor_nombre: product.proveedor_nombre || 'Sin proveedor',
        total_cantidad: Number(product.total_cantidad),
        precio_promedio_usd: Number(Number(product.precio_promedio_usd).toFixed(2)),
        total_ventas_usd: Number(Number(product.total_ventas_usd).toFixed(2)),
        total_ventas_ves: Number(Number(product.total_ventas_ves).toFixed(2)),
        numero_transacciones: Number(product.numero_transacciones),
        primera_venta: product.primera_venta,
        ultima_venta: product.ultima_venta,
        participacion_ventas: Number((Number(product.total_ventas_usd) / Number(totals.total_ventas_usd) * 100).toFixed(2))
      }));

      console.log('✅ Sales report generated successfully:', {
        productos_encontrados: productosFormateados.length,
        total_ventas_usd: estadisticas.totales.total_ventas_usd
      });

      res.json({
        success: true,
        data: {
          productos: productosFormateados,
          estadisticas,
          filtros_aplicados: {
            fecha_inicio,
            fecha_fin,
            categoria_id: categoria_id || null,
            proveedor_id: proveedor_id || null,
            metodo_pago: metodo_pago || null,
            usuario_id: usuario_id || null,
            producto_codigo: producto_codigo || null,      // ✅ NUEVO
            producto_descripcion: producto_descripcion || null  // ✅ NUEVO
          }
        }
      });

    } catch (error) {
      console.error('❌ Error generating sales report:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getSalesReportSummary = async (req: AuthRequest, res: Response) => {
    try {
      const { error, value } = this.salesReportSchema.validate(req.query);
      
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Parámetros inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const { fecha_inicio, fecha_fin } = value;

      // Resumen de ventas por día
      const ventasPorDia = await this.saleRepository
        .createQueryBuilder('venta')
        .select([
          'DATE(venta.fecha_venta) as fecha',
          'COUNT(venta.id) as total_transacciones',
          'SUM(venta.total_usd) as total_ventas_usd',
          'SUM(venta.total_ves) as total_ventas_ves',
          'AVG(venta.total_usd) as ticket_promedio_usd'
        ])
        .where('DATE(venta.fecha_venta) >= :fecha_inicio', { fecha_inicio })
        .andWhere('DATE(venta.fecha_venta) <= :fecha_fin', { fecha_fin })
        .andWhere('venta.estado = :estado', { estado: 'completada' })
        .groupBy('DATE(venta.fecha_venta)')
        .orderBy('fecha', 'ASC')
        .getRawMany();

      // Ventas por método de pago
      const ventasPorMetodo = await this.saleRepository
        .createQueryBuilder('venta')
        .select([
          'venta.metodo_pago as metodo',
          'COUNT(venta.id) as total_transacciones',
          'SUM(venta.total_usd) as total_ventas_usd'
        ])
        .where('DATE(venta.fecha_venta) >= :fecha_inicio', { fecha_inicio })
        .andWhere('DATE(venta.fecha_venta) <= :fecha_fin', { fecha_fin })
        .andWhere('venta.estado = :estado', { estado: 'completada' })
        .groupBy('venta.metodo_pago')
        .orderBy('total_ventas_usd', 'DESC')
        .getRawMany();

      res.json({
        success: true,
        data: {
          ventas_por_dia: ventasPorDia.map(dia => ({
            fecha: dia.fecha,
            total_transacciones: Number(dia.total_transacciones),
            total_ventas_usd: Number(Number(dia.total_ventas_usd).toFixed(2)),
            total_ventas_ves: Number(Number(dia.total_ventas_ves).toFixed(2)),
            ticket_promedio_usd: Number(Number(dia.ticket_promedio_usd).toFixed(2))
          })),
          ventas_por_metodo: ventasPorMetodo.map(metodo => ({
            metodo: metodo.metodo,
            total_transacciones: Number(metodo.total_transacciones),
            total_ventas_usd: Number(Number(metodo.total_ventas_usd).toFixed(2))
          }))
        }
      });

    } catch (error) {
      console.error('❌ Error generating sales summary:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
}