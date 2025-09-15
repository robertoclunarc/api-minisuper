import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { CashRegisterClose, CashRegisterStatus } from '../models/CashRegisterClose';
import { AuthRequest } from '../middleware/auth';

export class ReportController {
  private cashCloseRepository = AppDataSource.getRepository(CashRegisterClose);

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
}