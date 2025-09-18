import Joi from 'joi';

export const paymentDetailSchema = Joi.object({
  metodo_pago: Joi.string().valid(
    'efectivo_usd', 
    'efectivo_ves', 
    'tarjeta', 
    'transferencia', 
    'pago_movil'
  ).required().messages({
    'any.only': 'Método de pago inválido',
    'any.required': 'El método de pago es requerido'
  }),
  monto_usd: Joi.number().min(0).precision(2).default(0).messages({
    'number.base': 'El monto en USD debe ser un número válido',
    'number.min': 'El monto en USD no puede ser negativo'
  }),
  monto_ves: Joi.number().min(0).precision(2).default(0).messages({
    'number.base': 'El monto en VES debe ser un número válido',
    'number.min': 'El monto en VES no puede ser negativo'
  }),
  referencia: Joi.string().max(100).optional().allow('').messages({
    'string.max': 'La referencia no puede exceder 100 caracteres'
  }),
  observaciones: Joi.string().max(500).optional().allow('').messages({
    'string.max': 'Las observaciones no pueden exceder 500 caracteres'
  })
});


export const createSaleSchema = Joi.object({
  caja_id: Joi.number().integer().positive().required().messages({
    'number.base': 'La caja debe ser un número válido',
    'number.positive': 'Debe seleccionar una caja válida',
    'any.required': 'La caja es requerida'
  }),
  items: Joi.array().items(
    Joi.object({
      producto_id: Joi.number().integer().positive().required().messages({
        'number.base': 'El producto debe ser un número válido',
        'number.positive': 'Debe seleccionar un producto válido',
        'any.required': 'El producto es requerido'
      }),
      cantidad: Joi.number().integer().positive().required().messages({
        'number.base': 'La cantidad debe ser un número válido',
        'number.positive': 'La cantidad debe ser mayor a 0',
        'any.required': 'La cantidad es requerida'
      })
    })
  ).min(1).required().messages({
    'array.min': 'Debe agregar al menos un producto',
    'any.required': 'Los items son requeridos'
  }),
  pagos: Joi.array().items(paymentDetailSchema).min(1).required().messages({
    'array.min': 'Debe agregar al menos una forma de pago',
    'any.required': 'Las formas de pago son requeridas'
  }),
  monto_recibido_usd: Joi.number().min(0).precision(2).default(0).messages({
    'number.base': 'El monto recibido en USD debe ser un número válido',
    'number.min': 'El monto recibido en USD no puede ser negativo'
  }),
  monto_recibido_ves: Joi.number().min(0).precision(2).default(0).messages({
    'number.base': 'El monto recibido en VES debe ser un número válido',
    'number.min': 'El monto recibido en VES no puede ser negativo'
  }),
  descuento_usd: Joi.number().min(0).precision(2).default(0).messages({
    'number.base': 'El descuento en USD debe ser un número válido',
    'number.min': 'El descuento en USD no puede ser negativo'
  }),
  descuento_ves: Joi.number().min(0).precision(2).default(0).messages({
    'number.base': 'El descuento en VES debe ser un número válido',
    'number.min': 'El descuento en VES no puede ser negativo'
  })
});

export const cancelSaleSchema = Joi.object({
  motivo: Joi.string().min(10).max(500).required().messages({
    'string.empty': 'El motivo de cancelación es requerido',
    'string.min': 'El motivo debe tener al menos 10 caracteres',
    'string.max': 'El motivo no puede exceder 500 caracteres',
    'any.required': 'El motivo de cancelación es requerido'
  })
});