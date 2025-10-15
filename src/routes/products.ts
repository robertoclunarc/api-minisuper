import { Router } from 'express';
import { ProductController } from '../controllers/productController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();
const productController = new ProductController();

// Rutas para cajeros y administradores

router.get('/search-filters', authenticateToken, productController.searchProductsForFilters);
router.get('/pos', authenticateToken, productController.getProductsForPOS);

router.get('/:id/prices', authenticateToken, productController.getProductPrices);
router.get('/barcode/:barcode', authenticateToken, productController.searchByBarcode);

// Rutas solo para administradores
router.get('/', authenticateToken, productController.getProducts);
router.get('/:id', authenticateToken, productController.getProductById);
router.post('/', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  productController.createProduct
);
router.put('/:id', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  productController.updateProduct
);
router.delete('/:id', 
  authenticateToken, 
  requireRole([UserRole.ADMIN]), 
  productController.deleteProduct
);

router.get('/barcode/:barcode', authenticateToken, productController.getProductByBarcode);
router.get('/low-stock', authenticateToken, productController.getLowStockProducts);



export default router;