import { Router } from 'express';
import { ReportController } from '../controllers/reportController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const reportController = new ReportController();

// Gestión de cajas (cajeros y admins)
router.post('/cash/open', authenticateToken, reportController.openCashRegister);
router.post('/cash/close', authenticateToken, reportController.closeCashRegister);
router.get('/cash/status/:caja_id', authenticateToken, reportController.getCashRegisterStatus);

// Reportes (todos los usuarios autenticados)
router.get('/daily', authenticateToken, reportController.getDailyReport);
router.get('/products', authenticateToken, reportController.getProductSalesReport);

// Reportes administrativos (solo admins)
router.get('/cashiers', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  reportController.getCashierReport
);

export default router;