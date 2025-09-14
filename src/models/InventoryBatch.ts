import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Product } from './Product';
import { User } from './User';
import { Provider } from './Provider';
import { SaleDetail } from './SaleDetail';

@Entity('lotes_inventario')
export class InventoryBatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  producto_id: number;

  @Column({ nullable: true })
  proveedor_id: number;

  @Column({ length: 50, nullable: true })
  numero_lote: string;

  @Column()
  cantidad_inicial: number;

  @Column()
  cantidad_actual: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precio_costo_usd: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  tasa_cambio_registro: number;

  @Column({ type: 'date', nullable: true })
  fecha_vencimiento: Date;

  @CreateDateColumn()
  fecha_ingreso: Date;

  @Column({ nullable: true })
  usuario_id: number;

  @ManyToOne(() => Product, product => product.lotes)
  @JoinColumn({ name: 'producto_id' })
  producto: Product;

  @ManyToOne(() => User, user => user.lotes)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @ManyToOne(() => Provider, provider => provider.lotes)
  @JoinColumn({ name: 'proveedor_id' })
  proveedor: Provider;

  @OneToMany(() => SaleDetail, detail => detail.lote)
  detalles_venta: SaleDetail[];

  // Computed properties
  get precio_costo_ves(): number {
    return Number((this.precio_costo_usd * this.tasa_cambio_registro).toFixed(2));
  }

  get valor_inventario_usd(): number {
    return Number((this.cantidad_actual * this.precio_costo_usd).toFixed(2));
  }

  get valor_inventario_ves(): number {
    return Number((this.cantidad_actual * this.precio_costo_ves).toFixed(2));
  }

  isExpired(): boolean {
    if (!this.fecha_vencimiento) return false;
    return new Date() > this.fecha_vencimiento;
  }

  isExpiringSoon(days: number = 30): boolean {
    if (!this.fecha_vencimiento) return false;
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    return this.fecha_vencimiento <= futureDate;
  }
}