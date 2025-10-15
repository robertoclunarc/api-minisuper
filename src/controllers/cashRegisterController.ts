import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { CashRegister } from '../models/CashRegister';
import { CashRegisterClose, CashRegisterStatus } from '../models/CashRegisterClose';
import { CurrencyService } from '../services/currencyService';
import { AuthRequest } from '../middleware/auth';

export class CashRegisterController {
  private cashRegisterRepository = AppDataSource.getRepository(CashRegister);
  private cashCloseRepository = AppDataSource.getRepository(CashRegisterClose);
  private currencyService = new CurrencyService();

  public getCashRegisters = async (req: Request, res: Response) => {
    try {
      const cashRegisters = await this.cashRegisterRepository
        .createQueryBuilder('caja')
        .leftJoinAndSelect('caja.cierres', 'cierres', 'cierres.estado = :estado', { estado: CashRegisterStatus.OPEN })
        .where('caja.activo = :activo', { activo: true })
        .orderBy('caja.numero_caja', 'ASC')
        .getMany();

      const cashRegistersWithStatus = cashRegisters.map(cashRegister => ({
        ...cashRegister,
        estado: cashRegister.cierres && cashRegister.cierres.length > 0 ? 'abierto' : 'cerrado',
        cierre_actual: cashRegister.cierres && cashRegister.cierres.length > 0 ? cashRegister.cierres[0] : null
      }));

      res.json({
        success: true,
        data: cashRegistersWithStatus
      });
    } catch (error) {
      console.error('Error obteniendo cajas registradoras:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public openCashRegister = async (req: AuthRequest, res: Response) => {
    try {
      const { 
        caja_id, 
        monto_inicial_usd = 0, 
        monto_inicial_ves = 0, 
        observaciones 
      } = req.body;

      /*console.log('🔓 Opening cash register request:', {
        caja_id,
        monto_inicial_usd,
        monto_inicial_ves,
        user_id: req.user?.id,      // ✅ LOG DEL USER ID
        username: req.user?.username // ✅ LOG DEL USERNAME
      });*/

      // Verificar que la caja existe
      const cashRegister = await this.cashRegisterRepository.findOne({
        where: { id: caja_id, activo: true }
      });

      if (!cashRegister) {
        return res.status(404).json({
          success: false,
          message: 'Caja registradora no encontrada'
        });
      }

      // ✅ VERIFICAR QUE req.user EXISTE
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      /*console.log('👤 User trying to open cash:', { 
        id: req.user.id, 
        username: req.user.username 
      });*/

      // Verificar que no hay una caja ya abierta para este usuario
      const existingOpen = await this.cashCloseRepository.findOne({
        where: { 
          usuario_id: req.user.id,    // ✅ USAR EL ID CORRECTO
          estado: CashRegisterStatus.OPEN 
        }
      });

      //console.log('🔍 Existing open cash for user:', existingOpen);

      if (existingOpen) {
        return res.status(400).json({
          success: false,
          message: 'Ya tienes una caja abierta. Debes cerrarla antes de abrir otra.'
        });
      }

      // Verificar que esta caja no esté abierta por otro usuario
      const cajaAbierta = await this.cashCloseRepository.findOne({
        where: { 
          caja_id,
          estado: CashRegisterStatus.OPEN 
        }
      });

      //console.log('🔍 Cash register status:', cajaAbierta);

      if (cajaAbierta) {
        return res.status(400).json({
          success: false,
          message: 'Esta caja ya está abierta por otro usuario'
        });
      }

      // Obtener tasa de cambio actual
      const exchangeRate = await this.currencyService.getCurrentExchangeRate();

      const cashClose = this.cashCloseRepository.create({
        caja_id,
        usuario_id: req.user.id,    // ✅ USAR EL ID CORRECTO
        monto_inicial_usd,
        monto_inicial_ves,
        tasa_cambio_apertura: exchangeRate,
        estado: CashRegisterStatus.OPEN,
        observaciones
      });

      /*console.log('💾 Creating cash close record:', {
        caja_id: cashClose.caja_id,
        usuario_id: cashClose.usuario_id,
        estado: cashClose.estado
      });*/

      await this.cashCloseRepository.save(cashClose);

      const savedCashClose = await this.cashCloseRepository
        .createQueryBuilder('cierre')
        .leftJoinAndSelect('cierre.caja', 'caja')
        .leftJoinAndSelect('cierre.usuario', 'usuario')
        .where('cierre.id = :id', { id: cashClose.id })
        .getOne();

      //console.log('✅ Cash register opened successfully:', savedCashClose);

      res.status(201).json({
        success: true,
        message: 'Caja abierta exitosamente',
        data: savedCashClose
      });
    } catch (error) {
      console.error('❌ Error abriendo caja:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public closeCashRegister = async (req: AuthRequest, res: Response) => {
    try {
      const { 
        monto_final_usd, 
        monto_final_ves, 
        observaciones 
      } = req.body;

      const openCash = await this.cashCloseRepository.findOne({
        where: { 
          usuario_id: req.user!.id,
          estado: CashRegisterStatus.OPEN 
        },
        relations: ['ventas', 'caja', 'usuario']
      });

      if (!openCash) {
        return res.status(404).json({
          success: false,
          message: 'No se encontró una caja abierta para este usuario'
        });
      }

      // Obtener tasa de cambio actual
      const exchangeRate = await this.currencyService.getCurrentExchangeRate();

      // Actualizar cierre
      await this.cashCloseRepository.update(openCash.id, {
        fecha_cierre: new Date(),
        monto_final_usd,
        monto_final_ves,
        tasa_cambio_cierre: exchangeRate,
        observaciones,
        estado: CashRegisterStatus.CLOSED
      });

      // Obtener el cierre actualizado con estadísticas
      const closedCash = await this.cashCloseRepository
        .createQueryBuilder('cierre')
        .leftJoinAndSelect('cierre.ventas', 'ventas')
        .leftJoinAndSelect('cierre.usuario', 'usuario')
        .leftJoinAndSelect('cierre.caja', 'caja')
        .where('cierre.id = :id', { id: openCash.id })
        .getOne();

      // Calcular estadísticas del cierre
      const ventasStats = {
        total_ventas_efectivo_usd: closedCash?.ventas?.filter(v => v.metodo_pago === 'efectivo_usd').reduce((sum, v) => sum + v.total_usd, 0) || 0,
        total_ventas_efectivo_ves: closedCash?.ventas?.filter(v => v.metodo_pago === 'efectivo_ves').reduce((sum, v) => sum + v.total_ves, 0) || 0,
        total_ventas_tarjeta: closedCash?.ventas?.filter(v => v.metodo_pago === 'tarjeta').reduce((sum, v) => sum + v.total_usd, 0) || 0,
        diferencia_caja_usd: closedCash?.diferencia_caja_usd || 0
      };

      res.json({
        success: true,
        message: 'Caja cerrada exitosamente',
        data: {
          ...closedCash,
          estadisticas: ventasStats
        }
      });
    } catch (error) {
      console.error('Error cerrando caja:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getCashRegisterStatus = async (req: AuthRequest, res: Response) => {
    try {
      console.log('📊 Getting cash register status for user:', {
        id: req.user?.id,
        username: req.user?.username
      });

      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const openCash = await this.cashCloseRepository.findOne({
        where: { 
          usuario_id: req.user.id,    // ✅ USAR EL ID CORRECTO
          estado: CashRegisterStatus.OPEN 
        },
        relations: ['caja', 'usuario']
      });

      //console.log('🔍 Found open cash for user:', openCash);

      res.json({
        success: true,
        data: {
          is_open: !!openCash,
          cash_register: openCash
        }
      });
    } catch (error) {
      console.error('❌ Error obteniendo estado de caja:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getCashRegisterHistory = async (req: Request, res: Response) => {
    try {
      const { 
        caja_id, 
        fecha_inicio, 
        fecha_fin, 
        page = 1, 
        limit = 20 
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const queryBuilder = this.cashCloseRepository
        .createQueryBuilder('cierre')
        .leftJoinAndSelect('cierre.caja', 'caja')
        .leftJoinAndSelect('cierre.usuario', 'usuario')
        .where('cierre.estado = :estado', { estado: CashRegisterStatus.CLOSED });

      if (caja_id) {
        queryBuilder.andWhere('cierre.caja_id = :caja_id', { caja_id });
      }

      if (fecha_inicio) {
        queryBuilder.andWhere('DATE(cierre.fecha_apertura) >= :fecha_inicio', { fecha_inicio });
      }

      if (fecha_fin) {
        queryBuilder.andWhere('DATE(cierre.fecha_cierre) <= :fecha_fin', { fecha_fin });
      }

      const [closures, total] = await queryBuilder
        .orderBy('cierre.fecha_cierre', 'DESC')
        .skip(skip)
        .take(Number(limit))
        .getManyAndCount();

      res.json({
        success: true,
        data: {
          closures,
          pagination: {
            current_page: Number(page),
            total_pages: Math.ceil(total / Number(limit)),
            total_items: total,
            items_per_page: Number(limit)
          }
        }
      });
    } catch (error) {
      console.error('Error obteniendo historial de caja:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
}