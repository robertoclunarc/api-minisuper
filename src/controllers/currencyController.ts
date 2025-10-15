import { Request, Response } from 'express';
import { CurrencyService } from '../services/currencyService';
import { AuthRequest } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { ExchangeRate } from '../models/ExchangeRate';

export class CurrencyController {
  private currencyService = new CurrencyService();
  private exchangeRateRepository = AppDataSource.getRepository(ExchangeRate);

  public getCurrentRate = async (req: Request, res: Response) => {
    try {
      const rate = await this.currencyService.getCurrentExchangeRate();
      const latestRate = await this.currencyService.getLatestExchangeRate();

      res.json({
        success: true,
        data: {
          fecha: latestRate?.fecha,
          tasa_bcv: rate,
          tasa_paralelo: rate,
          fuente: latestRate?.fuente,
          created_at: latestRate?.created_at
        }
      });
    } catch (error) {
      console.error('Error obteniendo tasa actual:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo tasa de cambio'
      });
    }
  };

  public updateRate = async (req: AuthRequest, res: Response) => {
    try {
      const { id, fecha, tasa_bcv, tasa_paralelo } = req.body;

      if (!fecha || !tasa_bcv) {
        return res.status(400).json({
          success: false,
          message: 'Fecha y tasa BCV son requeridos'
        });
      }

      const updatedRate = await this.currencyService.updateExchangeRateManually(
        id,
        fecha, 
        tasa_bcv, 
        tasa_paralelo
      );

      res.json({
        success: true,
        message: 'Tasa de cambio actualizada exitosamente',
        data: updatedRate
      });
    } catch (error) {
      console.error('Error actualizando tasa:', error);
      res.status(500).json({
        success: false,
        message: 'Error actualizando tasa de cambio'
      });
    }
  };

  public refreshRate = async (req: Request, res: Response) => {
    try {
      const newRate = await this.currencyService.fetchCurrentExchangeRate();
      
      res.json({
        success: true,
        message: 'Tasa actualizada desde https://ve.dolarapi.com',
        data: {          
          fecha: new Date(),
          tasa_bcv: newRate,
          tasa_paralelo: 0,
          usd_ves: newRate,  
          fuente: 'https://ve.dolarapi.com',  
        }
      });
    } catch (error) {
      console.error('Error refrescando tasa:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo tasa desde https://ve.dolarapi.com'
      });
    }
  };

  public getHistory = async (req: Request, res: Response) => {
    try {
      const { fecha_desde, fecha_hasta } = req.query;

      if (!fecha_desde || !fecha_hasta) {
        return res.status(400).json({
          success: false,
          message: 'Fecha de inicio y fin son requeridas'
        });
      }

      // Calculate number of days between fecha_inicio and fecha_fin
      const startDate = new Date(fecha_desde as string);
      const endDate = new Date(fecha_hasta as string);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      const history = await this.currencyService.getExchangeRateHistory(diffDays);

      res.json({
        success: true,
        data: {
          rates: history,
          periodo: {
            fecha_desde,
            fecha_hasta
          }
        }
      });
    } catch (error) {
      console.error('Error obteniendo historial:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo historial de tasas'
      });
    }
  };

  public convertCurrency = async (req: Request, res: Response) => {
    try {
      const { amount, from, to } = req.query;

      if (!amount || !from || !to) {
        return res.status(400).json({
          success: false,
          message: 'Monto, moneda origen y destino son requeridos'
        });
      }

      const rate = await this.currencyService.getCurrentExchangeRate();
      let convertedAmount: number;

      if (from === 'USD' && to === 'VES') {
        convertedAmount = await this.currencyService.convertUsdToVes(Number(amount), rate);
      } else if (from === 'VES' && to === 'USD') {
        convertedAmount = await this.currencyService.convertVesToUsd(Number(amount), rate);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Conversión no válida. Use USD o VES'
        });
      }

      res.json({
        success: true,
        data: {
          monto_original: Number(amount),
          moneda_origen: from,
          monto_convertido: convertedAmount,
          moneda_destino: to,
          tasa_utilizada: rate
        }
      });
    } catch (error) {
      console.error('Error convirtiendo moneda:', error);
      res.status(500).json({
        success: false,
        message: 'Error en conversión de moneda'
      });
    }
  };

  public createManualRate = async (req: AuthRequest, res: Response) => {
    try {
      const { fecha, tasa_bcv, tasa_paralelo, fuente = 'manual' } = req.body;
      
      console.log('💱 Creating manual exchange rate:', req.body);

      // Validaciones
      if (!fecha || !tasa_bcv) {
        return res.status(400).json({
          success: false,
          message: 'Fecha y tasa USD/VES son requeridos'
        });
      }

      if (Number(tasa_bcv) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'La tasa debe ser mayor a 0'
        });
      }

      // Verificar que no exista una tasa para esa fecha
      const existingRate = await this.exchangeRateRepository.findOne({
        where: { fecha }
      });

      if (existingRate) {
        return res.status(400).json({
          success: false,
          message: `Ya existe una tasa de cambio para la fecha ${fecha}`
        });
      }

      // Crear nueva tasa
      const newRate = this.exchangeRateRepository.create({
        // Solo incluir propiedades válidas según el modelo ExchangeRate
        tasa_bcv: Number(tasa_bcv) || Number(tasa_bcv),
        tasa_paralelo: Number(tasa_paralelo) || Number(tasa_bcv),
        fuente: `${fuente}_${req.user?.nombre || 'admin'}`
      } as Partial<ExchangeRate>);

      // Asignar manualmente las propiedades adicionales si existen en el modelo
      (newRate as any).fecha = fecha;
      if ('tasa_bcv' in newRate) {
        (newRate as any).tasa_bcv = Number(tasa_bcv);
      }

      const savedRate = await this.exchangeRateRepository.save(newRate);

      console.log('✅ Manual exchange rate created:', savedRate.id);

      res.status(201).json({
        success: true,
        message: 'Tasa de cambio creada exitosamente',
        data: {
          id: savedRate.id,
          fecha: savedRate.fecha,
          tasa_bcv: Number(savedRate.tasa_bcv),
          tasa_paralelo: Number(savedRate.tasa_paralelo),          
          fuente: savedRate.fuente,
          created_at: savedRate.created_at
        }
      });

    } catch (error) {
      console.error('❌ Error creating manual exchange rate:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };  

  public getCurrencyStats = async (req: Request, res: Response) => {
    try {
      const { days = 30 } = req.query;
      
      console.log('📊 Getting currency statistics for', days, 'days');

      const daysNumber = Number(days);
      if (daysNumber <= 0 || daysNumber > 365) {
        return res.status(400).json({
          success: false,
          message: 'Los días deben estar entre 1 y 365'
        });
      }

      // Fecha de inicio para el período
      const fechaInicio = new Date();
      fechaInicio.setDate(fechaInicio.getDate() - daysNumber);
      const fechaInicioStr = fechaInicio.toISOString().split('T')[0];

      // Obtener tasas del período
      const rates = await this.exchangeRateRepository
        .createQueryBuilder('rate')
        .where('rate.fecha >= :fechaInicio', { fechaInicio: fechaInicioStr })
        .orderBy('rate.fecha', 'ASC')
        .getMany();

      if (rates.length === 0) {
        return res.json({
          success: true,
          data: {
            promedio_periodo: 0,
            variacion_porcentual: 0,
            tasa_minima: { valor: 0, fecha: fechaInicioStr },
            tasa_maxima: { valor: 0, fecha: fechaInicioStr },
            tendencia: 'estable' as const,
            volatilidad: 0
          }
        });
      }

      // ✅ CALCULAR ESTADÍSTICAS
      const valores = rates.map(rate => Number(rate.tasa_bcv));
      
      // Promedio
      const promedio_periodo = valores.reduce((sum, val) => sum + val, 0) / valores.length;
      
      // Tasa mínima y máxima
      const valorMinimo = Math.min(...valores);
      const valorMaximo = Math.max(...valores);
      
      const rateMinima = rates.find(rate => Number(rate.tasa_bcv) === valorMinimo);
      const rateMaxima = rates.find(rate => Number(rate.tasa_bcv) === valorMaximo);
      
      const tasa_minima = {
        valor: valorMinimo,
        fecha: rateMinima?.fecha || fechaInicioStr
      };
      
      const tasa_maxima = {
        valor: valorMaximo,
        fecha: rateMaxima?.fecha || fechaInicioStr
      };

      // Variación porcentual (comparar primera y última tasa)
      let variacion_porcentual = 0;
      if (rates.length >= 2) {
        const primeraTasa = Number(rates[0]?.tasa_bcv);
        const ultimaTasa = Number(rates[rates.length - 1]?.tasa_bcv);
        variacion_porcentual = ((ultimaTasa - primeraTasa) / primeraTasa) * 100;
      }

      // Tendencia
      let tendencia: 'alcista' | 'bajista' | 'estable' = 'estable';
      if (variacion_porcentual > 2) {
        tendencia = 'alcista';
      } else if (variacion_porcentual < -2) {
        tendencia = 'bajista';
      }

      // Volatilidad (desviación estándar como porcentaje del promedio)
      let volatilidad = 0;
      if (valores.length > 1) {
        const varianza = valores.reduce((sum, val) => {
          return sum + Math.pow(val - promedio_periodo, 2);
        }, 0) / valores.length;
        
        const desviacionEstandar = Math.sqrt(varianza);
        volatilidad = (desviacionEstandar / promedio_periodo) * 100;
      }

      const estadisticas = {
        promedio_periodo: Number(promedio_periodo.toFixed(2)),
        variacion_porcentual: Number(variacion_porcentual.toFixed(2)),
        tasa_minima,
        tasa_maxima,
        tendencia,
        volatilidad: Number(volatilidad.toFixed(2))
      };

      console.log('✅ Currency statistics calculated:', estadisticas);

      res.json({
        success: true,
        data: estadisticas
      });

    } catch (error) {
      console.error('❌ Error getting currency statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
}