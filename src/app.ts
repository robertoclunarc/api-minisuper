import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/config';
import { initializeDatabase } from './config/database';

// Importar rutas
// Importar todas las rutas
import authRoutes from './routes/auth';
import productRoutes from './routes/products';
import inventoryRoutes from './routes/inventory';
import saleRoutes from './routes/sales';
import reportRoutes from './routes/reports';
import currencyRoutes from './routes/currency';
import providerRoutes from './routes/providers';
import categoryRoutes from './routes/categories';
import cashRegisterRoutes from './routes/cashRegisters';

const app = express();

// Configurar rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    message: 'Demasiadas peticiones, intente más tarde'
  }
});

// Middleware de seguridad
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true
}));
app.use(limiter);

// Middleware de parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv
  });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/reports', reportRoutes);

app.use('/api/currency', currencyRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cash-registers', cashRegisterRoutes);

// Middleware de manejo de errores
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error no manejado:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: config.nodeEnv === 'production' 
      ? 'Error interno del servidor' 
      : err.message,
    ...(config.nodeEnv === 'development' && { stack: err.stack })
  });
});

// Ruta 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// Inicializar servidor
const startServer = async () => {
  try {
    await initializeDatabase();
    
    const server = app.listen(config.port, () => {
      console.log(`🚀 Servidor ejecutándose en puerto ${config.port}`);
      console.log(`📝 Ambiente: ${config.nodeEnv}`);
      console.log(`🗄️  Base de datos: ${config.database.database}`);
    });

    // Manejo graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM recibido, cerrando servidor...');
      server.close(() => {
        console.log('Servidor cerrado');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Error iniciando servidor:', error);
    process.exit(1);
  }
};

// Iniciar solo si no estamos en testing
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;