import { Router } from 'express';
import { ProviderController } from '../controllers/providerController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const providerController = new ProviderController();

// Rutas para consultar proveedores (cajeros y admins)
router.get('/', authenticateToken, providerController.getProviders);
router.get('/:id', authenticateToken, providerController.getProviderById);

// Rutas solo para administradores
router.post('/', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  providerController.createProvider
);

router.put('/:id', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  providerController.updateProvider
);

router.delete('/:id', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  providerController.deleteProvider
);

export default router;