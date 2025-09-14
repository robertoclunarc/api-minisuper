import { Router } from 'express';
import { InventoryController } from '../controllers/inventoryController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const inventoryController = new InventoryController();

// Rutas para consultar stock (cajeros y admins)
router.get('/stock', authenticateToken, inventoryController.getOverallStock);
router.get('/stock/:product_id', authenticateToken, inventoryController.getStockByProduct);
router.get('/expiring', authenticateToken, inventoryController.getExpiringProducts);

// Rutas para gestionar inventario (solo admins)
router.post('/batch', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  inventoryController.createBatch
);

router.post('/batch/multiple', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  inventoryController.createMultipleBatches
);

router.put('/adjust', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  inventoryController.adjustStock
);

export default router;