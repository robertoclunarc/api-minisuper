import { AppDataSource } from '../config/database';
import { ExchangeRate } from '../models/ExchangeRate';

export interface PyDolarResponse {
  datetime: string;
  monitors: {
    bcv: {
      price: number;
      last_update: string;
    };
    dolartoday: {
      price: number;
      last_update: string;
    };
  };
}

export class CurrencyService {
  private exchangeRateRepository = AppDataSource.getRepository(ExchangeRate);
  private readonly PYDOLAR_API = 'http://pydolarve.org/api/v1/dollar';

  /**
   * Obtiene la tasa de cambio actual del BCV desde PyDolar
   */
  public async fetchCurrentExchangeRate(): Promise<number> {
    try {
      const response = await fetch(this.PYDOLAR_API, {
        method: 'GET',
        timeout: 10000, // 10 segundos timeout
        headers: {
          'User-Agent': 'MiniSuper-System/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data: PyDolarResponse = await response.json();
      
      if (!data.monitors?.bcv?.price) {
        throw new Error('Respuesta inválida de PyDolar API');
      }

      const tasa = data.monitors.bcv.price;
      const tasaParalelo = data.monitors.dolartoday?.price || null;

      // Guardar en base de datos
      await this.saveExchangeRate(tasa, tasaParalelo);

      return tasa;
    } catch (error) {
      console.error('Error obteniendo tasa de PyDolar:', error);
      
      // Fallback: obtener última tasa guardada
      const lastRate = await this.getLatestExchangeRate();
      if (lastRate) {
        console.log('Usando última tasa guardada:', lastRate.tasa_bcv);
        return lastRate.tasa_bcv;
      }
      
      throw new Error('No se pudo obtener la tasa de cambio');
    }
  }

  /**
   * Guarda la tasa de cambio en la base de datos
   */
  private async saveExchangeRate(tasaBcv: number, tasaParalelo: number | null): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Verificar si ya existe una tasa para hoy
      const existingRate = await this.exchangeRateRepository.findOne({
        where: { fecha: new Date(today) }
      });

      if (existingRate) {
        // Actualizar tasa existente
        await this.exchangeRateRepository.update(existingRate.id, {
          tasa_bcv: tasaBcv,
          tasa_paralelo: tasaParalelo,
          created_at: new Date()
        });
      } else {
        // Crear nueva tasa
        const newRate = this.exchangeRateRepository.create({
          fecha: new Date(today),
          tasa_bcv: tasaBcv,
          tasa_paralelo: tasaParalelo,
          fuente: 'pydolar'
        });
        
        await this.exchangeRateRepository.save(newRate);
      }
    } catch (error) {
      console.error('Error guardando tasa de cambio:', error);
    }
  }

  /**
   * Obtiene la última tasa de cambio guardada
   */
  public async getLatestExchangeRate(): Promise<ExchangeRate | null> {
    return await this.exchangeRateRepository
      .createQueryBuilder('tasa')
      .orderBy('tasa.fecha', 'DESC')
      .getOne();
  }

  /**
   * Obtiene la tasa de cambio para una fecha específica
   */
  public async getExchangeRateByDate(fecha: string): Promise<ExchangeRate | null> {
    return await this.exchangeRateRepository.findOne({
      where: { fecha: new Date(fecha) }
    });
  }

  /**
   * Convierte USD a VES usando la tasa actual
   */
  public async convertUsdToVes(amountUsd: number, exchangeRate?: number): Promise<number> {
    const rate = exchangeRate || await this.getCurrentExchangeRate();
    return Number((amountUsd * rate).toFixed(2));
  }

  /**
   * Convierte VES a USD usando la tasa actual
   */
  public async convertVesToUsd(amountVes: number, exchangeRate?: number): Promise<number> {
    const rate = exchangeRate || await this.getCurrentExchangeRate();
    return Number((amountVes / rate).toFixed(2));
  }

  /**
   * Obtiene la tasa de cambio actual (desde caché o API)
   */
  public async getCurrentExchangeRate(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    
    // Intentar obtener tasa de hoy desde la base de datos
    const todayRate = await this.getExchangeRateByDate(today);
    
    if (todayRate) {
      return todayRate.tasa_bcv;
    }

    // Si no hay tasa de hoy, obtener desde API
    return await this.fetchCurrentExchangeRate();
  }

  /**
   * Actualiza la tasa de cambio manualmente (para administradores)
   */
  public async updateExchangeRateManually(
    fecha: string, 
    tasaBcv: number, 
    tasaParalelo?: number
  ): Promise<ExchangeRate> {
    const existingRate = await this.getExchangeRateByDate(fecha);
    
    if (existingRate) {
      await this.exchangeRateRepository.update(existingRate.id, {
        tasa_bcv: tasaBcv,
        tasa_paralelo: tasaParalelo || existingRate.tasa_paralelo,
        fuente: 'manual'
      });
      
      return await this.getExchangeRateByDate(fecha) as ExchangeRate;
    } else {
      const newRate = this.exchangeRateRepository.create({
        fecha: new Date(fecha),
        tasa_bcv: tasaBcv,
        tasa_paralelo: tasaParalelo,
        fuente: 'manual'
      });
      
      return await this.exchangeRateRepository.save(newRate);
    }
  }

  /**
   * Obtiene el historial de tasas de cambio
   */
  public async getExchangeRateHistory(
    fechaInicio: string, 
    fechaFin: string
  ): Promise<ExchangeRate[]> {
    return await this.exchangeRateRepository
      .createQueryBuilder('tasa')
      .where('tasa.fecha >= :fechaInicio', { fechaInicio })
      .andWhere('tasa.fecha <= :fechaFin', { fechaFin })
      .orderBy('tasa.fecha', 'DESC')
      .getMany();
  }

  /**
   * Formatea precios para mostrar en ambas monedas
   */
  public formatPrices(priceUsd: number, exchangeRate: number) {
    const priceVes = priceUsd * exchangeRate;
    
    return {
      usd: {
        amount: priceUsd,
        formatted: `$${priceUsd.toFixed(2)}`
      },
      ves: {
        amount: priceVes,
        formatted: `Bs. ${priceVes.toLocaleString('es-VE', { 
          minimumFractionDigits: 2, 
          maximumFractionDigits: 2 
        })}`
      },
      exchange_rate: exchangeRate
    };
  }
}