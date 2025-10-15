import Joi from 'joi';

export const createProductSchema = Joi.object({
  codigo_barras: Joi.string().min(8).max(50).required().messages({
    'string.empty': 'El código de barras es requerido',
    'string.min': 'El código de barras debe tener al menos 8 caracteres',
    'string.max': 'El código de barras no puede exceder 50 caracteres'
  }),
  codigo_interno: Joi.string().max(20).optional().allow('').messages({
    'string.max': 'El código interno no puede exceder 20 caracteres'
  }),
  nombre: Joi.string().min(2).max(200).required().messages({
    'string.empty': 'El nombre del producto es requerido',
    'string.min': 'El nombre debe tener al menos 2 caracteres',
    'string.max': 'El nombre no puede exceder 200 caracteres'
  }),
  descripcion: Joi.string().max(1000).optional().allow('').messages({
    'string.max': 'La descripción no puede exceder 1000 caracteres'
  }),
  categoria_id: Joi.number().integer().positive().optional().messages({
    'number.base': 'La categoría debe ser un número válido',
    'number.positive': 'La categoría debe ser un ID válido'
  }),
  proveedor_id: Joi.number().integer().positive().optional().messages({
    'number.base': 'El proveedor debe ser un número válido',
    'number.positive': 'El proveedor debe ser un ID válido'
  }),
  precio_venta_usd: Joi.number().positive().precision(2).required().messages({
    'number.base': 'El precio de venta debe ser un número válido',
    'number.positive': 'El precio de venta debe ser mayor a 0',
    'any.required': 'El precio de venta en USD es requerido'
  }),
  precio_costo_usd: Joi.number().positive().precision(2).required().messages({
    'number.base': 'El precio de costo debe ser un número válido',
    'number.positive': 'El precio de costo debe ser mayor a 0',
    'any.required': 'El precio de costo en USD es requerido'
  }),
  moneda_base: Joi.string().valid('USD', 'VES').default('USD').messages({
    'any.only': 'La moneda base debe ser USD o VES'
  }),
  stock_minimo: Joi.number().integer().min(0).default(0).messages({
    'number.base': 'El stock mínimo debe ser un número válido',
    'number.min': 'El stock mínimo no puede ser negativo'
  }),
  unidad_medida: Joi.string().valid('unidad', 'kg', 'litro', 'gramo', 'ml').default('unidad').messages({
    'any.only': 'La unidad de medida debe ser: unidad, kg, litro, gramo, o ml'
  }),
  activo: Joi.boolean().optional()
});

export const updateProductSchema = Joi.object({
  codigo_barras: Joi.string().min(8).max(50).optional().messages({
    'string.min': 'El código de barras debe tener al menos 8 caracteres',
    'string.max': 'El código de barras no puede exceder 50 caracteres'
  }),
  codigo_interno: Joi.string().max(20).optional().allow('').messages({
    'string.max': 'El código interno no puede exceder 20 caracteres'
  }),
  nombre: Joi.string().min(2).max(200).optional().messages({
    'string.min': 'El nombre debe tener al menos 2 caracteres',
    'string.max': 'El nombre no puede exceder 200 caracteres'
  }),
  descripcion: Joi.string().max(1000).optional().allow('').messages({
    'string.max': 'La descripción no puede exceder 1000 caracteres'
  }),
  categoria_id: Joi.number().integer().positive().optional().messages({
    'number.base': 'La categoría debe ser un número válido',
    'number.positive': 'La categoría debe ser un ID válido'
  }),
  proveedor_id: Joi.number().integer().positive().optional().messages({
    'number.base': 'El proveedor debe ser un número válido',
    'number.positive': 'El proveedor debe ser un ID válido'
  }),
  precio_venta_usd: Joi.number().positive().precision(2).optional().messages({
    'number.base': 'El precio de venta debe ser un número válido',
    'number.positive': 'El precio de venta debe ser mayor a 0'
  }),
  precio_costo_usd: Joi.number().positive().precision(2).optional().messages({
    'number.base': 'El precio de costo debe ser un número válido',
    'number.positive': 'El precio de costo debe ser mayor a 0'
  }),
  moneda_base: Joi.string().valid('USD', 'VES').optional().messages({
    'any.only': 'La moneda base debe ser USD o VES'
  }),
  stock_minimo: Joi.number().integer().min(0).optional().messages({
    'number.base': 'El stock mínimo debe ser un número válido',
    'number.min': 'El stock mínimo no puede ser negativo'
  }),
  unidad_medida: Joi.string().valid('unidad', 'kg', 'litro', 'gramo', 'ml').optional().messages({
    'any.only': 'La unidad de medida debe ser: unidad, kg, litro, gramo, o ml'
  }),
  activo: Joi.boolean().optional()
});