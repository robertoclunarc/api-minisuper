import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Sale } from './Sale';
import { Product } from './Product';
import { InventoryBatch } from './InventoryBatch';

@Entity('detalle_ventas')
export class SaleDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  venta_id: number;

  @Column()
  producto_id: number;

  @Column({ nullable: true })
  lote_id: number;

  @Column()
  cantidad: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  precio_unitario_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  precio_unitario_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal_ves: number;

  @ManyToOne(() => Sale, sale => sale.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta: Sale;

  @ManyToOne(() => Product, product => product.detalles_venta)
  @JoinColumn({ name: 'producto_id' })
  producto: Product;

  @ManyToOne(() => InventoryBatch, batch => batch.detalles_venta)
  @JoinColumn({ name: 'lote_id' })
  lote: InventoryBatch;

  // Computed properties
  get ganancia_unitaria_usd(): number {
    const costo = this.lote?.precio_costo_usd || 0;
    return this.precio_unitario_usd - costo;
  }

  get ganancia_total_usd(): number {
    return this.ganancia_unitaria_usd * this.cantidad;
  }

  get margen_ganancia(): number {
    const costo = this.lote?.precio_costo_usd || 0;
    return costo > 0 ? ((this.precio_unitario_usd - costo) / costo) * 100 : 0;
  }
}