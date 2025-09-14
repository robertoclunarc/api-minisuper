import { Router } from 'express';
import { CategoryController } from '../controllers/categoryController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const categoryController = new CategoryController();

// Rutas para consultar categorías (cajeros y admins)
router.get('/', authenticateToken, categoryController.getCategories);
router.get('/:id', authenticateToken, categoryController.getCategoryById);

// Rutas solo para administradores
router.post('/', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  categoryController.createCategory
);

router.put('/:id', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  categoryController.updateCategory
);

router.delete('/:id', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  categoryController.deleteCategory
);

export default router;