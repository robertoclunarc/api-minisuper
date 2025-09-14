import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Product } from '../models/Product';
import { Category } from '../models/Category';
import { Provider } from '../models/Provider';
import { InventoryBatch } from '../models/InventoryBatch';
import { CurrencyService } from '../services/currencyService';
import { createProductSchema, updateProductSchema } from '../validations/productValidation';

export class ProductController {
  private productRepository = AppDataSource.getRepository(Product);
  private categoryRepository = AppDataSource.getRepository(Category);
  private providerRepository = AppDataSource.getRepository(Provider);
  private batchRepository = AppDataSource.getRepository(InventoryBatch);
  private currencyService = new CurrencyService();

  public getProducts = async (req: Request, res: Response) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        search, 
        categoria_id, 
        proveedor_id,
        low_stock = false 
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const queryBuilder = this.productRepository
        .createQueryBuilder('producto')
        .leftJoinAndSelect('producto.categoria', 'categoria')
        .leftJoinAndSelect('producto.proveedor', 'proveedor')
        .leftJoinAndSelect('producto.lotes', 'lotes')
        .where('producto.activo = :activo', { activo: true });

      // Filtros existentes...
      if (search) {
        queryBuilder.andWhere(
          '(producto.codigo_barras LIKE :search OR producto.codigo_interno LIKE :search OR producto.nombre LIKE :search OR producto.descripcion LIKE :search)',
          { search: `%${search}%` }
        );
      }

      if (categoria_id) {
        queryBuilder.andWhere('producto.categoria_id = :categoria_id', { categoria_id });
      }

      if (proveedor_id) {
        queryBuilder.andWhere('producto.proveedor_id = :proveedor_id', { proveedor_id });
      }

      const [products, total] = await queryBuilder
        .skip(skip)
        .take(Number(limit))
        .getManyAndCount();

      // Obtener tasa de cambio actual
      const exchangeRate = await this.currencyService.getCurrentExchangeRate();

      // Procesar productos con precios en ambas monedas
      const productsWithPrices = products.map(product => {
        const stock_total = product.lotes?.reduce((total, lote) => total + lote.cantidad_actual, 0) || 0;
        
        return {
          ...product,
          stock_total,
          precios: product.getFormattedPrices(exchangeRate),
          stock_status: stock_total <= product.stock_minimo ? 'bajo' : 'normal'
        };
      });

      // Filtrar productos con stock bajo si se solicita
      let filteredProducts = productsWithPrices;
      if (low_stock === 'true') {
        filteredProducts = productsWithPrices.filter(product => 
          product.stock_total <= product.stock_minimo
        );
      }

      res.json({
        success: true,
        data: {
          products: filteredProducts,
          exchange_rate: exchangeRate,
          pagination: {
            current_page: Number(page),
            total_pages: Math.ceil(total / Number(limit)),
            total_items: total,
            items_per_page: Number(limit)
          }
        }
      });
    } catch (error) {
      console.error('Error obteniendo productos:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public searchByBarcode = async (req: Request, res: Response) => {
    try {
      const { barcode } = req.params;
      
      const product = await this.productRepository
        .createQueryBuilder('producto')
        .leftJoinAndSelect('producto.categoria', 'categoria')
        .leftJoinAndSelect('producto.proveedor', 'proveedor')
        .leftJoinAndSelect('producto.lotes', 'lotes')
        .where('(producto.codigo_barras = :barcode OR producto.codigo_interno = :barcode) AND producto.activo = :activo', 
               { barcode, activo: true })
        .getOne();

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }

      // Obtener tasa de cambio actual
      const exchangeRate = await this.currencyService.getCurrentExchangeRate();

      const stock_total = product.lotes?.reduce((total, lote) => total + lote.cantidad_actual, 0) || 0;
      const available_batches = product.lotes?.filter(lote => lote.cantidad_actual > 0) || [];

      const productWithPrices = {
        ...product,
        stock_total,
        available_batches,
        precios: product.getFormattedPrices(exchangeRate),
        stock_status: stock_total <= product.stock_minimo ? 'bajo' : 'normal'
      };

      res.json({
        success: true,
        data: productWithPrices
      });
    } catch (error) {
      console.error('Error buscando producto por código:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public createProduct = async (req: Request, res: Response) => {
    try {
      const { error, value } = createProductSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      // Verificar si el código de barras ya existe
      const existingProduct = await this.productRepository.findOne({
        where: { codigo_barras: value.codigo_barras }
      });

      if (existingProduct) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe un producto con este código de barras'
        });
      }

      const createProduct = this.productRepository.create(value);
      const product = Array.isArray(createProduct) ? createProduct[0] : createProduct;
      await this.productRepository.save(createProduct);

      if (!product) {
        return res.status(500).json({
          success: false,
          message: 'No se pudo crear el producto'
        });
      }

      const savedProduct = await this.productRepository
        .createQueryBuilder('producto')
        .leftJoinAndSelect('producto.categoria', 'categoria')
        .leftJoinAndSelect('producto.proveedor', 'proveedor')
        .where('producto.id = :id', { id: product.id })
        .getOne();

      // Agregar precios en ambas monedas
      const exchangeRate = await this.currencyService.getCurrentExchangeRate();
      const productWithPrices = {
        ...savedProduct,
        precios: savedProduct!.getFormattedPrices(exchangeRate)
      };

      res.status(201).json({
        success: true,
        message: 'Producto creado exitosamente',
        data: productWithPrices
      });
    } catch (error) {
      console.error('Error creando producto:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getProductPrices = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { fecha } = req.query;

      const product = await this.productRepository.findOne({
        where: { id: Number(id), activo: true }
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }

      // Obtener tasa de cambio para la fecha especificada o actual
      let exchangeRate: number;
      if (fecha) {
        const rateForDate = await this.currencyService.getExchangeRateByDate(fecha as string);
        exchangeRate = rateForDate ? rateForDate.tasa_bcv : await this.currencyService.getCurrentExchangeRate();
      } else {
        exchangeRate = await this.currencyService.getCurrentExchangeRate();
      }

      const precios = product.getFormattedPrices(exchangeRate);

      res.json({
        success: true,
        data: {
          producto_id: product.id,
          nombre: product.nombre,
          codigo_barras: product.codigo_barras,
          precios,
          fecha_consulta: fecha || new Date().toISOString().split('T')[0]
        }
      });
    } catch (error) {
      console.error('Error obteniendo precios del producto:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getProductsForPOS = async (req: Request, res: Response) => {
    try {
      const { search, limit = 20 } = req.query;

      let queryBuilder = this.productRepository
        .createQueryBuilder('producto')
        .leftJoinAndSelect('producto.lotes', 'lotes')
        .where('producto.activo = :activo', { activo: true })
        .andWhere('EXISTS (SELECT 1 FROM lotes_inventario l WHERE l.producto_id = producto.id AND l.cantidad_actual > 0)');

      if (search) {
        queryBuilder = queryBuilder.andWhere(
          '(producto.codigo_barras LIKE :search OR producto.codigo_interno LIKE :search OR producto.nombre LIKE :search)',
          { search: `%${search}%` }
        );
      }

      const products = await queryBuilder
        .orderBy('producto.nombre', 'ASC')
        .limit(Number(limit))
        .getMany();

      const exchangeRate = await this.currencyService.getCurrentExchangeRate();

      const posProducts = products.map(product => {
        const stock_total = product.lotes?.reduce((total, lote) => total + lote.cantidad_actual, 0) || 0;
        const available_batches = product.lotes?.filter(lote => lote.cantidad_actual > 0) || [];
        
        return {
          id: product.id,
          codigo_barras: product.codigo_barras,
          codigo_interno: product.codigo_interno,
          nombre: product.nombre,
          stock_total,
          available_batches: available_batches.map(batch => ({
            id: batch.id,
            cantidad_disponible: batch.cantidad_actual,
            fecha_vencimiento: batch.fecha_vencimiento
          })),
          precios: product.getFormattedPrices(exchangeRate)
        };
      });

      res.json({
        success: true,
        data: {
          productos: posProducts,
          tasa_cambio: exchangeRate,
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.error('Error obteniendo productos para POS:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
}