import Joi from 'joi';

export const createCategorySchema = Joi.object({
  nombre: Joi.string().min(2).max(100).required().messages({
    'string.empty': 'El nombre de la categoría es requerido',
    'string.min': 'El nombre debe tener al menos 2 caracteres',
    'string.max': 'El nombre no puede exceder 100 caracteres'
  }),
  descripcion: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'La descripción no puede exceder 500 caracteres'
  })
});

export const updateCategorySchema = Joi.object({
  nombre: Joi.string().min(2).max(100).optional().messages({
    'string.min': 'El nombre debe tener al menos 2 caracteres',
    'string.max': 'El nombre no puede exceder 100 caracteres'
  }),
  descripcion: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'La descripción no puede exceder 500 caracteres'
  }),
  activo: Joi.boolean().optional()
});