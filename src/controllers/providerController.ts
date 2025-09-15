import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Provider } from '../models/Provider';
import { createProviderSchema, updateProviderSchema } from '../validations/providerValidation';

export class ProviderController {
  private providerRepository = AppDataSource.getRepository(Provider);

  public getProviders = async (req: Request, res: Response) => {
    try {
      const { 
        page = 1, 
        limit = 50, 
        search,
        activo = true 
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const queryBuilder = this.providerRepository
        .createQueryBuilder('proveedor')
        .leftJoinAndSelect('proveedor.productos', 'productos')
        .where('proveedor.activo = :activo', { activo });

      if (search) {
        queryBuilder.andWhere(
          '(proveedor.nombre LIKE :search OR proveedor.contacto LIKE :search OR proveedor.email LIKE :search)',
          { search: `%${search}%` }
        );
      }

      const [providers, total] = await queryBuilder
        .skip(skip)
        .take(Number(limit))
        .orderBy('proveedor.nombre', 'ASC')
        .getManyAndCount();

      res.json({
        success: true,
        data: {
          providers,
          pagination: {
            current_page: Number(page),
            total_pages: Math.ceil(total / Number(limit)),
            total_items: total,
            items_per_page: Number(limit)
          }
        }
      });
    } catch (error) {
      console.error('Error obteniendo proveedores:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public getProviderById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const provider = await this.providerRepository
        .createQueryBuilder('proveedor')
        .leftJoinAndSelect('proveedor.productos', 'productos')
        .leftJoinAndSelect('proveedor.lotes', 'lotes')
        .where('proveedor.id = :id', { id })
        .getOne();

      if (!provider) {
        return res.status(404).json({
          success: false,
          message: 'Proveedor no encontrado'
        });
      }

      res.json({
        success: true,
        data: provider
      });
    } catch (error) {
      console.error('Error obteniendo proveedor:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public createProvider = async (req: Request, res: Response) => {
    try {
      const { error, value } = createProviderSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const provider = this.providerRepository.create(value);
      await this.providerRepository.save(provider);

      res.status(201).json({
        success: true,
        message: 'Proveedor creado exitosamente',
        data: provider
      });
    } catch (error) {
      console.error('Error creando proveedor:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public updateProvider = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { error, value } = updateProviderSchema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Datos de entrada inválidos',
          errors: error.details.map(detail => detail.message)
        });
      }

      const provider = await this.providerRepository.findOne({
        where: { id: Number(id) }
      });

      if (!provider) {
        return res.status(404).json({
          success: false,
          message: 'Proveedor no encontrado'
        });
      }

      await this.providerRepository.update(Number(id), value);

      const updatedProvider = await this.providerRepository.findOne({
        where: { id: Number(id) }
      });

      res.json({
        success: true,
        message: 'Proveedor actualizado exitosamente',
        data: updatedProvider
      });
    } catch (error) {
      console.error('Error actualizando proveedor:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };

  public deleteProvider = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const provider = await this.providerRepository.findOne({
        where: { id: Number(id) }
      });

      if (!provider) {
        return res.status(404).json({
          success: false,
          message: 'Proveedor no encontrado'
        });
      }

      // Soft delete
      await this.providerRepository.update(Number(id), { activo: false });

      res.json({
        success: true,
        message: 'Proveedor eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error eliminando proveedor:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  };
}