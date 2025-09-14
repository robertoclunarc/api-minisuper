import { Request, Response } from 'express';
import { CurrencyService } from '../services/currencyService';
import { AuthRequest } from '../middleware/auth';

export class CurrencyController {
  private currencyService = new CurrencyService();

  public getCurrentRate = async (req: Request, res: Response) => {
    try {
      const rate = await this.currencyService.getCurrentExchangeRate();
      const latestRate = await this.currencyService.getLatestExchangeRate();

      res.json({
        success: true,
        data: {
          tasa_actual: rate,
          ultima_actualizacion: latestRate?.created_at,
          fuente: latestRate?.fuente || 'pydolar'
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
      const { fecha, tasa_bcv, tasa_paralelo } = req.body;

      if (!fecha || !tasa_bcv) {
        return res.status(400).json({
          success: false,
          message: 'Fecha y tasa BCV son requeridos'
        });
      }

      const updatedRate = await this.currencyService.updateExchangeRateManually(
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
        message: 'Tasa actualizada desde PyDolar',
        data: {
          nueva_tasa: newRate,
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error('Error refrescando tasa:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo tasa desde PyDolar'
      });
    }
  };

  public getHistory = async (req: Request, res: Response) => {
    try {
      const { fecha_inicio, fecha_fin } = req.query;

      if (!fecha_inicio || !fecha_fin) {
        return res.status(400).json({
          success: false,
          message: 'Fecha de inicio y fin son requeridas'
        });
      }

      const history = await this.currencyService.getExchangeRateHistory(
        fecha_inicio as string,
        fecha_fin as string
      );

      res.json({
        success: true,
        data: {
          historial: history,
          periodo: {
            fecha_inicio,
            fecha_fin
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
}