import { Router } from 'express';
import { CashRegisterController } from '../controllers/cashRegisterController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const cashRegisterController = new CashRegisterController();

// Rutas para cajeros y administradores
router.get('/', authenticateToken, cashRegisterController.getCashRegisters);
router.get('/status', /*authenticateToken,*/ cashRegisterController.getCashRegisterStatus);
router.post('/open', authenticateToken, cashRegisterController.openCashRegister);
router.post('/close', authenticateToken, cashRegisterController.closeCashRegister);

// Rutas solo para administradores
router.get('/history', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  cashRegisterController.getCashRegisterHistory
);

export default router;