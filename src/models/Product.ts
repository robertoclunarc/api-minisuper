import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Category } from './Category';
import { Provider } from './Provider';
import { InventoryBatch } from './InventoryBatch';
import { SaleDetail } from './SaleDetail';

export enum UnitOfMeasure {
  UNIT = 'unidad',
  KG = 'kg',
  LITER = 'litro',
  GRAM = 'gramo',
  ML = 'ml'
}

export enum Currency {
  USD = 'USD',
  VES = 'VES'
}

@Entity('productos')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  codigo_barras: string;

  @Column({ unique: true, length: 20, nullable: true })
  codigo_interno: string;

  @Column({ length: 200 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ nullable: true })
  categoria_id: number;

  @Column({ nullable: true })
  proveedor_id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precio_venta_usd: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precio_costo_usd: number;

  @Column({ type: 'enum', enum: Currency, default: Currency.USD })
  moneda_base: Currency;

  @Column({ default: 0 })
  stock_minimo: number;

  @Column({ type: 'enum', enum: UnitOfMeasure, default: UnitOfMeasure.UNIT })
  unidad_medida: UnitOfMeasure;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Category, category => category.productos)
  @JoinColumn({ name: 'categoria_id' })
  categoria: Category;

  @ManyToOne(() => Provider, provider => provider.productos)
  @JoinColumn({ name: 'proveedor_id' })
  proveedor: Provider;

  @OneToMany(() => InventoryBatch, batch => batch.producto)
  lotes: InventoryBatch[];

  @OneToMany(() => SaleDetail, detail => detail.producto)
  detalles_venta: SaleDetail[];

  // Computed properties
  get stock_total(): number {
    return this.lotes?.reduce((total, lote) => total + lote.cantidad_actual, 0) || 0;
  }

  // Métodos para cálculo de precios
  getPriceInVes(exchangeRate: number): number {
    return Number((this.precio_venta_usd * exchangeRate).toFixed(2));
  }

  getCostInVes(exchangeRate: number): number {
    return Number((this.precio_costo_usd * exchangeRate).toFixed(2));
  }

  getFormattedPrices(exchangeRate: number) {
    return {
      usd: {
        venta: this.precio_venta_usd,
        costo: this.precio_costo_usd,
        formatted_venta: `$${this.precio_venta_usd.toFixed(2)}`,
        formatted_costo: `$${this.precio_costo_usd.toFixed(2)}`
      },
      ves: {
        venta: this.getPriceInVes(exchangeRate),
        costo: this.getCostInVes(exchangeRate),
        formatted_venta: `Bs. ${this.getPriceInVes(exchangeRate).toLocaleString('es-VE')}`,
        formatted_costo: `Bs. ${this.getCostInVes(exchangeRate).toLocaleString('es-VE')}`
      },
      exchange_rate: exchangeRate
    };
  }
}