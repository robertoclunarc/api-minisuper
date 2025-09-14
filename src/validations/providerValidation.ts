import Joi from 'joi';

export const createProviderSchema = Joi.object({
  nombre: Joi.string().min(2).max(150).required().messages({
    'string.empty': 'El nombre del proveedor es requerido',
    'string.min': 'El nombre debe tener al menos 2 caracteres',
    'string.max': 'El nombre no puede exceder 150 caracteres'
  }),
  contacto: Joi.string().max(100).optional().allow('').messages({
    'string.max': 'El contacto no puede exceder 100 caracteres'
  }),
  telefono: Joi.string().pattern(/^[\+]?[0-9\-\(\)\s]+$/).max(20).optional().allow('').messages({
    'string.pattern.base': 'El teléfono debe contener solo números y caracteres válidos',
    'string.max': 'El teléfono no puede exceder 20 caracteres'
  }),
  email: Joi.string().email().max(100).optional().allow('').messages({
    'string.email': 'Debe proporcionar un email válido',
    'string.max': 'El email no puede exceder 100 caracteres'
  }),
  direccion: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'La dirección no puede exceder 500 caracteres'
  })
});

export const updateProviderSchema = Joi.object({
  nombre: Joi.string().min(2).max(150).optional().messages({
    'string.min': 'El nombre debe tener al menos 2 caracteres',
    'string.max': 'El nombre no puede exceder 150 caracteres'
  }),
  contacto: Joi.string().max(100).optional().allow('').messages({
    'string.max': 'El contacto no puede exceder 100 caracteres'
  }),
  telefono: Joi.string().pattern(/^[\+]?[0-9\-\(\)\s]+$/).max(20).optional().allow('').messages({
    'string.pattern.base': 'El teléfono debe contener solo números y caracteres válidos',
    'string.max': 'El teléfono no puede exceder 20 caracteres'
  }),
  email: Joi.string().email().max(100).optional().allow('').messages({
    'string.email': 'Debe proporcionar un email válido',
    'string.max': 'El email no puede exceder 100 caracteres'
  }),
  direccion: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'La dirección no puede exceder 500 caracteres'
  }),
  activo: Joi.boolean().optional()
});