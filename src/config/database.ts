import { DataSource } from 'typeorm';
import { User } from '../models/User';
import { Product } from '../models/Product';
import { Category } from '../models/Category';
import { Provider } from '../models/Provider';
import { InventoryBatch } from '../models/InventoryBatch';
import { CashRegister } from '../models/CashRegister';
import { CashRegisterClose } from '../models/CashRegisterClose';
import { Sale } from '../models/Sale';
import { SaleDetail } from '../models/SaleDetail';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'minisuper_db',
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  entities: [
    User,
    Product,
    Category,
    Provider,
    InventoryBatch,
    CashRegister,
    CashRegisterClose,
    Sale,
    SaleDetail
  ],
  migrations: ['src/migrations/*.ts'],
  charset: 'utf8mb4'
});

export const initializeDatabase = async () => {
  try {
    await AppDataSource.initialize();
    console.log('✅ Base de datos conectada exitosamente');
  } catch (error) {
    console.error('❌ Error conectando a la base de datos:', error);
    process.exit(1);
  }
};