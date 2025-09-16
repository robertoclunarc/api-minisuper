import { Router } from 'express';
import { CurrencyController } from '../controllers/currencyController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const currencyController = new CurrencyController();

// Rutas públicas para cajeros
router.get('/current', /*authenticateToken,*/ currencyController.getCurrentRate);
router.get('/convert', authenticateToken, currencyController.convertCurrency);
router.post('/refresh', authenticateToken, currencyController.refreshRate);

// Rutas administrativas
router.put('/update', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  currencyController.updateRate
);

router.get('/history', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  currencyController.getHistory
);

export default router;