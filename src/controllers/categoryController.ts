import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Category } from '../models/Category';
import { createCategorySchema, updateCategorySchema } from '../validations/categoryValidation';

export class CategoryController {
  private categoryRepository = AppDataSource.getRepository(Category);

  public getCategories = async (req: Request, res: Response) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        search,
        activo = true 
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const queryBuilder = this.categoryRepository
        .createQueryBuilder('categoria')
        .leftJoinAndSelect('categoria.productos', 'productos')
        .where('categoria.activo = :activo', { activo });

      if (search) {
        queryBuilder.andWhere(
          '(categoria.nombre LIKE :search OR categoria.descripcion LIKE :search)',
          { search: `%${search}%` }
        );
      }

      const [categories, total] = await queryBuilder
        .skip(skip)
        .take(Number(limit))
        .orderBy('categoria.nombre', 'ASC')
        .getManyAndCount();

      // Agregar conteo de productos por categoría
      const categoriesWithCount = categories.map(category => ({
        ...category,
        productos_count: category.productos?.length || 0
      }));

      res.json({
        success: true,
        data: {
          categories: categoriesWithCount,
          pagination: {
            current_page: Number(page),
            total_pages: Math.ceil(total / Number(limit)),
            total_items: total,
            items_per_page: Number(limit)
          }
        }
      });
    } catch (error) {
      console.error('Error obteniendo categorías:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getCategoryById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const category = await this.categoryRepository
        .createQueryBuilder('categoria')
        .leftJoinAndSelect('categoria.productos', 'productos')
        .where('categoria.id = :id', { id })
        .getOne();

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      res.json({
        success: true,
        data: {
          ...category,
          productos_count: category.productos?.length || 0
        }
      });
    } catch (error) {
      console.error('Error obteniendo categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public createCategory = async (req: Request, res: Response) => {
    try {
      const { error, value } = createCategorySchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      // Verificar si ya existe una categoría con el mismo nombre
      const existingCategory = await this.categoryRepository.findOne({
        where: { nombre: value.nombre }
      });

      if (existingCategory) {
        return res.status(409).json({
          success: false,
          message: 'Ya existe una categoría con este nombre'
        });
      }

      const category = this.categoryRepository.create(value);
      await this.categoryRepository.save(category);

      res.status(201).json({
        success: true,
        message: 'Categoría creada exitosamente',
        data: category
      });
    } catch (error) {
      console.error('Error creando categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public updateCategory = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { error, value } = updateCategorySchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const category = await this.categoryRepository.findOne({
        where: { id: Number(id) }
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Verificar si el nuevo nombre ya existe en otra categoría
      if (value.nombre && value.nombre !== category.nombre) {
        const existingCategory = await this.categoryRepository.findOne({
          where: { nombre: value.nombre }
        });

        if (existingCategory) {
          return res.status(409).json({
            success: false,
            message: 'Ya existe una categoría con este nombre'
          });
        }
      }

      await this.categoryRepository.update(Number(id), value);

      const updatedCategory = await this.categoryRepository.findOne({
        where: { id: Number(id) }
      });

      res.json({
        success: true,
        message: 'Categoría actualizada exitosamente',
        data: updatedCategory
      });
    } catch (error) {
      console.error('Error actualizando categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public deleteCategory = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const category = await this.categoryRepository
        .createQueryBuilder('categoria')
        .leftJoinAndSelect('categoria.productos', 'productos')
        .where('categoria.id = :id', { id })
        .getOne();

      if (!category) {
        return res.status(404).json({
          success: false,
          message: 'Categoría no encontrada'
        });
      }

      // Verificar si la categoría tiene productos asociados
      if (category.productos && category.productos.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'No se puede eliminar la categoría porque tiene productos asociados'
        });
      }

      // Soft delete
      await this.categoryRepository.update(Number(id), { activo: false });

      res.json({
        success: true,
        message: 'Categoría eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error eliminando categoría:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
}