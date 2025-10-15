import { Router } from 'express';
import { InventoryController } from '../controllers/inventoryController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const inventoryController = new InventoryController();

// Rutas para consultar stock (cajeros y admins)
router.get('/batches', authenticateToken, inventoryController.getBatches);
router.get('/stock/:product_id', authenticateToken, inventoryController.getStockByProduct);
router.get('/expiring', authenticateToken, inventoryController.getExpiringProducts);

// Rutas para gestionar inventario (solo admins)
router.post('/batches', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  inventoryController.createBatch
);

router.post('/batch/multiple', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  inventoryController.createMultipleBatches
);

//router.put('/batches/:id', authenticateToken, inventoryController.updateBatch);
router.put('/batches/:id', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  inventoryController.adjustStock
);

export default router;