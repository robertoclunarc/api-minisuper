import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Sale } from './Sale';

export enum PaymentMethod {
  EFECTIVO_USD = 'efectivo_usd',
  EFECTIVO_VES = 'efectivo_ves',
  TARJETA = 'tarjeta',
  TRANSFERENCIA = 'transferencia',
  PAGO_MOVIL = 'pago_movil'
}

@Entity('detalle_pagos')
export class PaymentDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  venta_id: number;

  @Column({ type: 'enum', enum: PaymentMethod })
  metodo_pago: PaymentMethod;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  monto_ves: number;

  @Column({ length: 100, nullable: true })
  referencia?: string; // Para tarjetas, transferencias, etc.

  @Column({ type: 'text', nullable: true })
  observaciones?: string;

  @CreateDateColumn()
  created_at: Date;

  // Relaciones
  @ManyToOne(() => Sale, sale => sale.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta: Sale;

  // Computed properties
  get monto_total_usd(): number {
    return Number(this.monto_usd) + (Number(this.monto_ves) / 161.888); // Convertir VES a USD
  }
}