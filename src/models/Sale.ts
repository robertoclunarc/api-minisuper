import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User';
import { CashRegister } from './CashRegister';
import { CashRegisterClose } from './CashRegisterClose';
import { SaleDetail } from './SaleDetail';
import { PaymentDetail } from './PaymentDetail';

export enum SaleStatus {
  COMPLETED = 'completada',
  CANCELED = 'cancelada',
  PENDING = 'pendiente'
}

@Entity('ventas')
export class Sale {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  numero_venta: string;

  @Column()
  caja_id: number;

  @Column()
  usuario_id: number;

  @Column({ nullable: true })
  cierre_caja_id?: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  descuento_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  descuento_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  impuesto_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  impuesto_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  tasa_cambio_venta: number;

  // ✅ CAMBIAR A RESUMEN DE MÉTODOS
  @Column({ length: 255 })
  metodo_pago: string; // Ej: "efectivo_usd+tarjeta" o "mixto"

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_recibido_usd: number; // TOTAL recibido

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  monto_recibido_ves: number; // TOTAL recibido

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cambio_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cambio_ves: number;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.COMPLETED })
  estado: SaleStatus;

  @Column({ type: 'text', nullable: true })
  motivo_cancelacion?: string;

  @Column({ type: 'datetime', nullable: true })
  fecha_cancelacion?: Date;

  @Column({ nullable: true })
  cancelado_por?: number;

  @CreateDateColumn()
  fecha_venta: Date;

  // Relaciones
  @ManyToOne(() => User, user => user.ventas)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @ManyToOne(() => CashRegister, cashRegister => cashRegister.ventas)
  @JoinColumn({ name: 'caja_id' })
  caja: CashRegister;

  @ManyToOne(() => CashRegisterClose, cashClose => cashClose.ventas)
  @JoinColumn({ name: 'cierre_caja_id' })
  cierre_caja: CashRegisterClose;

  @OneToMany(() => SaleDetail, detail => detail.venta)
  detalles: SaleDetail[];

  // ✅ NUEVA RELACIÓN PARA DETALLES DE PAGO
  @OneToMany(() => PaymentDetail, paymentDetail => paymentDetail.venta)
  detalle_pagos: PaymentDetail[];

  // Computed properties
  get numero_factura(): string {
    return this.numero_venta;
  }

  get tasa_cambio(): number {
    return this.tasa_cambio_venta;
  }

  get tiene_pagos_multiples(): boolean {
    return this.detalle_pagos?.length > 1;
  }
}