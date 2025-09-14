import { Router } from 'express';
import { SaleController } from '../controllers/saleController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const saleController = new SaleController();

// Rutas para cajeros y administradores
router.post('/', authenticateToken, saleController.createSale);
router.get('/', authenticateToken, saleController.getSales);
router.get('/daily', authenticateToken, saleController.getDailySales);
router.get('/:id', authenticateToken, saleController.getSaleById);
router.get('/:id/receipt', authenticateToken, saleController.getSaleReceipt);

// Rutas solo para administradores
router.put('/:id/cancel', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  saleController.cancelSale
);

export default router;