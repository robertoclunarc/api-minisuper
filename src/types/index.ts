export enum Currency {
  USD = 'USD',
  VES = 'VES'
}

export enum UnitOfMeasure {
  UNIT = 'unidad',
  KG = 'kg',
  LITER = 'litro',
  GRAM = 'gramo',
  ML = 'ml'
}

export interface Provider {
  id?: number;
  nombre?: string;
  contacto?: string;
  telefono?: string;
  email?: string;
  direccion?: string;
  activo?: boolean;
  created_at?: Date;
}

export interface Category {  
  id?: number;  
  nombre?: string;  
  descripcion?: string;  
  activo?: boolean;  
  created_at?: Date;  
}

export interface Product {  
  id: number; 
  codigo_barras?: string;  
  codigo_interno?: string; 
  nombre?: string; 
  descripcion?: string;  
  categoria_id?: number;  
  proveedor_id?: number;  
  precio_venta_usd?: number;  
  precio_costo_usd?: number;  
  moneda_base?: Currency;  
  stock_minimo?: number;  
  unidad_medida?: UnitOfMeasure;  
  activo?: boolean;  
  created_at: Date;  
  updated_at?: Date;  
  categoria?: Category;  
  proveedor?: Provider;  
}

// Payment Types
export interface PaymentDetail {
  id?: number;
  metodo_pago: string;
  monto_usd: number;
  monto_ves: number;
  referencia?: string;
  observaciones?: string;
}

export interface SaleDetail {  
  id?: number;  
  venta_id?: number; 
  producto_id?: number;  
  lote_id?: number;  
  cantidad?: number;  
  precio_unitario_usd?: number;  
  precio_unitario_ves?: number;  
  subtotal_usd?: number;  
  subtotal_ves?: number;  
}  

// Sale Types
export interface SaleItem {
  producto_id: number;
  cantidad: number;
  producto?: Product
}

export interface Sale {
  id: number;
  numero_venta: string;
  fecha_venta: string;
  subtotal_usd: number;
  subtotal_ves: number;
  descuento_usd: number;
  descuento_ves: number;
  impuesto_usd: number;
  impuesto_ves: number;
  total_usd: number;
  total_ves: number;
  metodo_pago: string; // Resumen de métodos
  monto_recibido_usd: number;
  monto_recibido_ves: number;
  cambio_usd: number;
  cambio_ves: number;
  tasa_cambio_venta: number;
  estado: string;
  detalles: SaleDetail[];
  detalles_pago?: PaymentDetail[]; // ✅ NUEVA PROPIEDAD
  usuario: User;
  caja: CashRegister;
  
  // Alias para compatibilidad
  tasa_cambio?: number;
  //numero_factura?: string;
}

export interface CashRegister {
  id?: number; 
  numero_caja?: number; 
  nombre?: string;
  activo?: boolean;  
  created_at?: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  CASHIER = 'cajero'
}

export interface User {  
  id?: number;  
  username?: string;  
  password?: string;  
  nombre?: string; 
  rol?: UserRole;  
  activo?: boolean;  
  created_at?: Date;  
  updated_at?: Date; 
}