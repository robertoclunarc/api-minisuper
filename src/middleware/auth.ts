import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { User } from '../models/User';

export interface AuthRequest extends Request {
  user?: User;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token de acceso requerido'
      });
    }

    // Verificar y decodificar el token
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    console.log('🔑 Token decoded:', decoded); // Para debug
    
    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido'
      });
    }

    // Buscar el usuario en la base de datos
    const { AppDataSource } = await import('../config/database');
    const userRepository = AppDataSource.getRepository(User);
    
    const user = await userRepository.findOne({
      where: { id: decoded.id, activo: true }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    console.log('👤 Authenticated user:', { id: user.id, username: user.username }); // Para debug
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Auth error:', error);
    return res.status(403).json({
      success: false,
      message: 'Token inválido'
    });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      });
    }

    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({
        success: false,
        message: 'Permisos insuficientes'
      });
    }

    next();
  };
};