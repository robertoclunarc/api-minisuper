import Joi from 'joi';

export const loginSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).required().messages({
    'string.empty': 'El nombre de usuario es requerido',
    'string.alphanum': 'El nombre de usuario solo puede contener letras y números',
    'string.min': 'El nombre de usuario debe tener al menos 3 caracteres',
    'string.max': 'El nombre de usuario no puede exceder 50 caracteres',
    'any.required': 'El nombre de usuario es requerido'
  }),
  password: Joi.string().min(4).required().messages({
    'string.empty': 'La contraseña es requerida',
    'string.min': 'La contraseña debe tener al menos 4 caracteres',
    'any.required': 'La contraseña es requerida'
  })
});

export const createUserSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(50).required().messages({
    'string.empty': 'El nombre de usuario es requerido',
    'string.alphanum': 'El nombre de usuario solo puede contener letras y números',
    'string.min': 'El nombre de usuario debe tener al menos 3 caracteres',
    'string.max': 'El nombre de usuario no puede exceder 50 caracteres',
    'any.required': 'El nombre de usuario es requerido'
  }),
  password: Joi.string().min(6).pattern(new RegExp('^(?=.*[a-zA-Z])(?=.*[0-9])')).required().messages({
    'string.empty': 'La contraseña es requerida',
    'string.min': 'La contraseña debe tener al menos 6 caracteres',
    'string.pattern.base': 'La contraseña debe contener al menos una letra y un número',
    'any.required': 'La contraseña es requerida'
  }),
  nombre: Joi.string().min(2).max(100).required().messages({
    'string.empty': 'El nombre es requerido',
    'string.min': 'El nombre debe tener al menos 2 caracteres',
    'string.max': 'El nombre no puede exceder 100 caracteres',
    'any.required': 'El nombre es requerido'
  }),
  rol: Joi.string().valid('admin', 'cajero').required().messages({
    'any.only': 'El rol debe ser admin o cajero',
    'any.required': 'El rol es requerido'
  })
});