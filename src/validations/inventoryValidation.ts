import Joi from 'joi';

export const batchEntrySchema = Joi.object({
  producto_id: Joi.number().integer().positive().required().messages({
    'number.base': 'El producto debe ser un número válido',
    'number.positive': 'Debe seleccionar un producto válido',
    'any.required': 'El producto es requerido'
  }),
  proveedor_id: Joi.number().integer().positive().optional().messages({
    'number.base': 'El proveedor debe ser un número válido',
    'number.positive': 'Debe seleccionar un proveedor válido'
  }),
  numero_lote: Joi.string().max(50).optional().allow('').messages({
    'string.max': 'El número de lote no puede exceder 50 caracteres'
  }),
  cantidad_inicial: Joi.number().integer().positive().required().messages({
    'number.base': 'La cantidad debe ser un número válido',
    'number.positive': 'La cantidad debe ser mayor a 0',
    'any.required': 'La cantidad inicial es requerida'
  }),
  cantidad_actual: Joi.number().integer().positive().required().messages({
    'number.base': 'La cantidad actual debe ser un número válido',
    'number.positive': 'La cantidad actual debe ser mayor a 0',
    'any.required': 'La cantidad actual inicial es requerida'
  }),
  precio_costo_usd: Joi.number().positive().precision(2).required().messages({
    'number.base': 'El precio de costo debe ser un número válido',
    'number.positive': 'El precio de costo debe ser mayor a 0',
    'any.required': 'El precio de costo en USD es requerido'
  }),
  fecha_vencimiento: Joi.date().greater('now').optional().messages({
    'date.base': 'La fecha de vencimiento debe ser una fecha válida',
    'date.greater': 'La fecha de vencimiento debe ser futura'
  }),
  tasa_cambio_registro: Joi.number().positive().precision(2).required().messages({
    'number.base': 'La tasa Cambio debe ser un número válido',    
    'any.required': 'la tasa cambio en BS es requerido'
  }),
  fecha_ingreso: Joi.date().default('now').optional().messages({
    'date.base': 'La fecha_ingreso debe ser una fecha válida',
    
  }),
});

export const stockAdjustmentSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'El lote debe ser un número válido',
    'number.positive': 'Debe seleccionar un lote válido',
    'any.required': 'El lote es requerido'
  }),
  cantidad_actual: Joi.number().integer().min(0).required().messages({
    'number.base': 'La nueva cantidad debe ser un número válido',
    'number.min': 'La nueva cantidad no puede ser negativa',
    'any.required': 'La nueva cantidad es requerida'
  }),
  producto_id: Joi.number().integer().positive().required().messages({
    'number.base': 'El producto debe ser un número válido',
    'number.positive': 'Debe seleccionar un producto válido',
    'any.required': 'El producto es requerido'
  }),
  proveedor_id: Joi.number().integer().positive().optional().messages({
    'number.base': 'El proveedor debe ser un número válido',
    'number.positive': 'Debe seleccionar un proveedor válido'
  }),
  numero_lote: Joi.string().max(50).optional().allow('').messages({
    'string.max': 'El número de lote no puede exceder 50 caracteres'
  }),
  cantidad_inicial: Joi.number().integer().positive().required().messages({
    'number.base': 'La cantidad debe ser un número válido',
    'number.positive': 'La cantidad debe ser mayor a 0',
    'any.required': 'La cantidad inicial es requerida'
  }),
  precio_costo_usd: Joi.number().positive().precision(2).required().messages({
    'number.base': 'El precio de costo debe ser un número válido',
    'number.positive': 'El precio de costo debe ser mayor a 0',
    'any.required': 'El precio de costo en USD es requerido'
  }),
  fecha_vencimiento: Joi.date().greater('now').optional().messages({
    'date.base': 'La fecha de vencimiento debe ser una fecha válida',
    'date.greater': 'La fecha de vencimiento debe ser futura'
  }),
  tasa_cambio_registro: Joi.number().positive().precision(2).required().messages({
    'number.base': 'La tasa Cambio debe ser un número válido',    
    'any.required': 'la tasa cambio en BS es requerido'
  }),
  fecha_ingreso: Joi.date().default('now').optional().messages({
    'date.base': 'La fecha_ingreso debe ser una fecha válida',
    
  })
});