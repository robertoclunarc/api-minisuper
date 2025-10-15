import { config } from '../config/config';
import { AppDataSource } from '../config/database';
import { ExchangeRate } from '../models/ExchangeRate';
import axios from "axios";

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
  private readonly PYDOLAR_API = config.urlApiDolar || 'https://ve.dolarapi.com/v1/dolares/oficial';

  /**
   * Obtiene la tasa de cambio actual del BCV desde PyDolar
   */
  public async fetchCurrentExchangeRate(): Promise<number> {
    const options = {
            method: 'GET',
            url: this.PYDOLAR_API,
            headers: {'Content-Type': 'application/json'}
          };
    const today = new Date().toISOString().split('T')[0] || '';      
    try {
      const response = await axios.request(options);

      if (!response.data) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data: PyDolarResponse = {
        datetime: today,
        monitors: {
          bcv: {
            price: response.data.promedio,
            last_update: response.data.fechaActualizacion
          },
          dolartoday: {
            price: response.data.promedio,
            last_update: response.data.fechaActualizacion
          }
        }
      }
      
      if (!data.monitors?.bcv?.price) {
        throw new Error(`Respuesta inválida de ${this.PYDOLAR_API}`);
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
      const today = new Date();
      const todayStr: string = today.toISOString().split('T')[0] ?? '';
      // Verificar si ya existe una tasa para hoy
      const existingRate = await this.exchangeRateRepository.findOne({
        where: { fecha: todayStr }
      });

      if (existingRate) {
        // Actualizar tasa existente
        await this.exchangeRateRepository.update(existingRate.id, {
          tasa_bcv: tasaBcv,
          tasa_paralelo: tasaParalelo ?? 0,
          created_at: new Date().toISOString(),
        });
      } else {
        // Crear nueva tasa
        const newRate = this.exchangeRateRepository.create({
          fecha: todayStr,
          tasa_bcv: tasaBcv,
          tasa_paralelo: tasaParalelo ?? 0,
          fuente: this.PYDOLAR_API
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
    
    const response = await this.exchangeRateRepository.findOne({
      where: { fecha: fecha }
    });
    
    return response;
  }

  public async getExchangeRateById(id: number): Promise<ExchangeRate | null> {
    
    const response = await this.exchangeRateRepository.findOne({
      where: { id: id }
    });
    
    return response;
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
    try {
      // Intentar obtener la tasa de hoy desde la BD
      const today = new Date();
      const todayStr: string = today.toISOString().split('T')[0] ?? '';
      
      let exchangeRate = await this.exchangeRateRepository.findOne({
        where: { fecha: todayStr }
      });
      
      if (!exchangeRate) {
        // Si no existe, obtener desde la API externa
        exchangeRate = await this.fetchAndSaveExchangeRate();
        
      }
      
      return exchangeRate?.tasa_bcv || 1;
    } catch (error) {
      console.error('Error obteniendo tasa de cambio:', error);
      return 1; // Valor por defecto
    }
  }

  private async fetchAndSaveExchangeRate(): Promise<ExchangeRate | null> {
    try {
      console.log('📡 Fetching exchange rate from external API...');
      
      const response = await axios.get('https://ve.dolarapi.com/v1/dolares/oficial', {
        timeout: 5000
      });
      console.log('Response from external API:', response.data);
      if (response.data && response.data.promedio) {
        const rate = response.data.promedio;
        const today = new Date();
        const todayStr: string = today.toISOString().split('T')[0] ?? '';
        // ✅ USAR upsert PARA EVITAR DUPLICADOS
        const exchangeRate = await this.exchangeRateRepository
          .createQueryBuilder()
          .insert()
          .into(ExchangeRate)
          .values({
            fecha: todayStr,
            tasa_bcv: rate,
            tasa_paralelo: rate,
            fuente: 'https://ve.dolarapi.com/v1/dolares/oficial'
          })
          .orUpdate(['tasa_bcv', 'tasa_paralelo', 'fuente'], ['fecha'])
          .execute();

        console.log('✅ Exchange rate saved/updated:', rate);

        // Retornar el registro actualizado
        return await this.exchangeRateRepository.findOne({
          where: { fecha: todayStr }
        });
      }

      return null;
    } catch (error) {
      console.error('❌ Error fetching external exchange rate:', error);
      return null;
    }
  }

  /**
   * Actualiza la tasa de cambio manualmente (para administradores)
   */
  public async updateExchangeRateManually(
    id: number,
    fecha: string, 
    tasaBcv: number, 
    tasaParalelo?: number
  ): Promise<ExchangeRate> {

    const existingRate = await this.getExchangeRateById(id);
    
    if (existingRate) {
      await this.exchangeRateRepository.update(id, {
        tasa_bcv: tasaBcv,
        tasa_paralelo: tasaParalelo || existingRate.tasa_paralelo,
        fuente: 'manual'
      });
      
      return await this.getExchangeRateById(id) as ExchangeRate;
    } else {
      const newRate = this.exchangeRateRepository.create({
        fecha: fecha,
        tasa_bcv: tasaBcv,
        tasa_paralelo: tasaParalelo || 0,
        fuente: 'manual'
      });
      
      return await this.exchangeRateRepository.save(newRate);
    }
  }

  /**
   * Obtiene el historial de tasas de cambio
   */
  public async getExchangeRateHistory(days: number = 30) {
    try {
      const rates = await this.exchangeRateRepository
        .createQueryBuilder('rate')
        .orderBy('rate.fecha', 'DESC')
        .limit(days)
        .getMany();

      return rates;
    } catch (error) {
      console.error('Error obteniendo historial de tasas:', error);
      return [];
    }
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