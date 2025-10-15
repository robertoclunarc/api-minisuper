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
      //activo = true 
    } = req.query;

    const activo = req.query.activo === 'true' ? true : req.query.activo === 'false' ? false : true;

    const skip = (Number(page) - 1) * Number(limit);
    
    // ✅ CONSULTA SIMPLIFICADA SIN getFormattedPrices
    const queryBuilder = this.productRepository
      .createQueryBuilder('producto')
      .leftJoinAndSelect('producto.categoria', 'categoria')
      .leftJoinAndSelect('producto.proveedor', 'proveedor')
      .leftJoin('producto.lotes', 'lotes')
      .addSelect('COALESCE(SUM(lotes.cantidad_actual), 0)', 'stock_actual')
      .where('producto.activo = :activo', { activo })
      .groupBy('producto.id')
      .addGroupBy('categoria.id')
      .addGroupBy('proveedor.id');

    if (search) {
      queryBuilder.andWhere(
        '(producto.codigo_barras LIKE :search OR producto.codigo_interno LIKE :search OR producto.nombre LIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (categoria_id) {
      queryBuilder.andWhere('producto.categoria_id = :categoria_id', { categoria_id });
    }

    if (proveedor_id) {
      queryBuilder.andWhere('producto.proveedor_id = :proveedor_id', { proveedor_id });
    }

    const { entities, raw } = await queryBuilder
      .skip(skip)
      .take(Number(limit))
      .orderBy('producto.nombre', 'ASC')
      .getRawAndEntities();

      //console.log('el query ejecutado es', queryBuilder.getSql());


    // ✅ MAPEAR RESULTADOS MANUALMENTE Y ASEGURAR TIPOS
    const products = entities.map((product, index) => {
      const stockActual = Number(raw[index]?.stock_actual) || 0;
      
      return {
        ...product,
        // Asegurar que los precios sean números
        precio_venta_usd: Number(product.precio_venta_usd),
        precio_costo_usd: Number(product.precio_costo_usd),
        stock_minimo: Number(product.stock_minimo),
        stock_actual: stockActual
      };
    });

    //console.log('✅ Products found:', products.length);

    // Obtener el total de productos (sin paginación)
    const total = await queryBuilder.getCount();

    res.json({
      success: true,
      data: {
        products,
        pagination: {
          current_page: Number(page),
          total_pages: Math.ceil(total / Number(limit)),
          total_items: total,
          items_per_page: Number(limit)
        }
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo productos:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

public searchProductsForFilters = async (req: Request, res: Response) => {
  try {
    const { q, type = 'codigo' } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length < 1) {
      return res.json({
        success: true,
        data: []
      });
    }

    const searchTerm = q.trim();
    let query = this.productRepository
      .createQueryBuilder('producto')
      .select([
        'producto.id',
        'producto.codigo_barras',
        'producto.nombre'
      ])
      .where('producto.activo = :activo', { activo: true });

    if (type === 'codigo') {
      query = query.andWhere('producto.codigo_barras LIKE :search', { 
        search: `%${searchTerm}%` 
      });
    } else if (type === 'descripcion') {
      query = query.andWhere('producto.nombre LIKE :search', { 
        search: `%${searchTerm}%` 
      });
    }

    const products = await query
      .orderBy('producto.nombre', 'ASC')
      .limit(20) // Limitar resultados para performance
      .getMany();

    console.log(`🔍 Product search (${type}): "${searchTerm}" - ${products.length} results`);

    res.json({
      success: true,
      data: products
    });

  } catch (error) {
    console.error('❌ Error searching products for filters:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
};

  public getProductById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const product = await this.productRepository
        .createQueryBuilder('producto')
        .leftJoinAndSelect('producto.categoria', 'categoria')
        .leftJoinAndSelect('producto.proveedor', 'proveedor')
        .leftJoinAndSelect('producto.lotes', 'lotes')
        .where('producto.id = :id', { id })
        .getOne();

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }

      // Calcular stock actual
      const stockActual = product.lotes.reduce((total, lote) => total + lote.cantidad_actual, 0);
      
      // Calcular valor de inventario
      const valorInventarioUSD = product.lotes.reduce((total, lote) => 
        total + (lote.cantidad_actual * lote.precio_costo_usd), 0
      );

      res.json({
        success: true,
        data: {
          ...product,
          stock_actual: stockActual,
          valor_inventario_usd: Number(valorInventarioUSD.toFixed(2)),
          estado_stock: stockActual <= product.stock_minimo ? 'bajo' : 'normal',
          total_lotes: product.lotes.length,
          lotes_disponibles: product.lotes.filter(lote => lote.cantidad_actual > 0).length
        }
      });
    } catch (error) {
      console.error('Error obteniendo producto:', error);
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
        console.error('Validation error creating product:', error);
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

  public updateProduct = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { error, value } = updateProductSchema.validate(req.body);
      //console.log('Updating product ID:', id, 'with data:', req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const product = await this.productRepository.findOne({
        where: { id: Number(id) }
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }

      // Verificar código de barras único si se está actualizando
      if (value.codigo_barras && value.codigo_barras !== product.codigo_barras) {
        const existingProduct = await this.productRepository.findOne({
          where: { codigo_barras: value.codigo_barras }
        });

        if (existingProduct) {
          return res.status(409).json({
            success: false,
            message: 'Ya existe un producto con este código de barras'
          });
        }
      }

      // Verificar categoría si se está actualizando
      if (value.categoria_id) {
        const category = await this.categoryRepository.findOne({
          where: { id: value.categoria_id, activo: true }
        });

        if (!category) {
          return res.status(404).json({
            success: false,
            message: 'Categoría no encontrada'
          });
        }
      }

      // Verificar proveedor si se está actualizando
      if (value.proveedor_id) {
        const provider = await this.providerRepository.findOne({
          where: { id: value.proveedor_id, activo: true }
        });

        if (!provider) {
          return res.status(404).json({
            success: false,
            message: 'Proveedor no encontrado'
          });
        }
      }

      await this.productRepository.update(Number(id), value);

      const updatedProduct = await this.productRepository.findOne({
        where: { id: Number(id) },
        relations: ['categoria', 'proveedor']
      });

      res.json({
        success: true,
        message: 'Producto actualizado exitosamente',
        data: updatedProduct
      });
    } catch (error) {
      console.error('Error actualizando producto:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public deleteProduct = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const product = await this.productRepository.findOne({
        where: { id: Number(id) },
        relations: ['lotes', 'detalles_venta']
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }

      // Verificar si el producto tiene stock
      const stockActual = product.lotes.reduce((total, lote) => total + lote.cantidad_actual, 0);
      
      if (stockActual > 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede eliminar el producto porque tiene stock disponible'
        });
      }

      // Verificar si el producto ha sido vendido
      if (product.detalles_venta && product.detalles_venta.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede eliminar el producto porque tiene historial de ventas'
        });
      }

      // Soft delete - marcar como inactivo
      await this.productRepository.update(Number(id), { activo: false });

      res.json({
        success: true,
        message: 'Producto eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error eliminando producto:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getProductByBarcode = async (req: Request, res: Response) => {
    try {
      const { barcode } = req.params;

      const product = await this.productRepository
        .createQueryBuilder('producto')
        .leftJoinAndSelect('producto.categoria', 'categoria')
        .leftJoinAndSelect('producto.proveedor', 'proveedor')
        .leftJoinAndSelect('producto.lotes', 'lotes')
        .where('producto.codigo_barras = :barcode', { barcode })
        .andWhere('producto.activo = :activo', { activo: true })
        .getOne();

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Producto no encontrado'
        });
      }

      // Calcular stock disponible
      const stockDisponible = product.lotes
        .filter(lote => lote.cantidad_actual > 0)
        .reduce((total, lote) => total + lote.cantidad_actual, 0);

      if (stockDisponible === 0) {
        return res.status(400).json({
          success: false,
          message: 'Producto sin stock disponible'
        });
      }

      res.json({
        success: true,
        data: {
          ...product,
          stock_disponible: stockDisponible,
          puede_venderse: stockDisponible > 0
        }
      });
    } catch (error) {
      console.error('Error buscando producto por código:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getLowStockProducts = async (req: Request, res: Response) => {
    try {
      const products = await this.productRepository
        .createQueryBuilder('producto')
        .leftJoinAndSelect('producto.categoria', 'categoria')
        .leftJoinAndSelect('producto.proveedor', 'proveedor')
        .leftJoin('producto.lotes', 'lotes')
        .addSelect('COALESCE(SUM(lotes.cantidad_actual), 0)', 'stock_actual')
        .where('producto.activo = :activo', { activo: true })
        .groupBy('producto.id')
        .addGroupBy('categoria.id')
        .addGroupBy('proveedor.id')
        .having('COALESCE(SUM(lotes.cantidad_actual), 0) <= producto.stock_minimo')
        .orderBy('stock_actual', 'ASC')
        .getRawAndEntities();

      const lowStockProducts = products.entities.map((product, index) => ({
        ...product,
        stock_actual: Number(products.raw[index].stock_actual),
        diferencia_stock: Number(products.raw[index].stock_actual) - product.stock_minimo
      }));

      res.json({
        success: true,
        data: {
          productos_stock_bajo: lowStockProducts,
          total_productos: lowStockProducts.length,
          productos_sin_stock: lowStockProducts.filter(p => p.stock_actual === 0).length
        }
      });
    } catch (error) {
      console.error('Error obteniendo productos con stock bajo:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
}
