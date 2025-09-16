import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const authController = new AuthController();

// Rutas públicas
router.post('/login', authController.login);

// Rutas protegidas
router.get('/profile', authenticateToken, authController.getProfile);

// Rutas de administrador
router.post('/users', 
  //authenticateToken, 
  //requireRole([UserRole.ADMIN]), 
  authController.createUser
);

export default router;