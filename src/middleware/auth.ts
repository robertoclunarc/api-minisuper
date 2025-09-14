import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import { AppDataSource } from '../config/database';
import { User, UserRole } from '../models/User';

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

    const decoded = jwt.verify(token, config.jwtSecret) as any;
    
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ 
      where: { id: decoded.userId, activo: true } 
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Usuario no válido' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false, 
      message: 'Token inválido' 
    });
  }
};

export const requireRole = (roles: UserRole[]) => {
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