import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn, BeforeInsert } from 'typeorm';
import { User } from './User';
import { CashRegister } from './CashRegister';
import { CashRegisterClose } from './CashRegisterClose';
import { SaleDetail } from './SaleDetail';

export enum PaymentMethod {
  CASH_USD = 'efectivo_usd',
  CASH_VES = 'efectivo_ves',
  CARD = 'tarjeta',
  TRANSFER = 'transferencia',
  MOBILE_PAYMENT = 'pago_movil',
  MIXED = 'mixto'
}

export interface PaymentDetail {
  id?: number;
  metodo_pago: string;
  monto_usd: number;
  monto_ves: number;
  referencia?: string;
  observaciones?: string;
}

export enum SaleStatus {
  COMPLETED = 'completada',
  CANCELLED = 'anulada'
}

@Entity('ventas')
export class Sale {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 20 })
  numero_factura: string;

  @Column()
  caja_id: number;

  @Column()
  usuario_id: number;

  @Column({ nullable: true })
  cierre_caja_id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  impuesto_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  impuesto_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  descuento_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  descuento_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  tasa_cambio_venta: number;

  @Column({ length: 255 })
  metodo_pago: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_recibido_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  monto_recibido_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cambio_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  cambio_ves: number;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.COMPLETED })
  estado: SaleStatus;

  @CreateDateColumn()
  fecha_venta: Date;

  @ManyToOne(() => CashRegister, cashRegister => cashRegister.ventas)
  @JoinColumn({ name: 'caja_id' })
  caja: CashRegister;

  @ManyToOne(() => User, user => user.ventas)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @ManyToOne(() => CashRegisterClose, close => close.ventas)
  @JoinColumn({ name: 'cierre_caja_id' })
  cierre_caja: CashRegisterClose;

  @OneToMany(() => SaleDetail, detail => detail.venta, { cascade: true })
  detalles: SaleDetail[];

  @BeforeInsert()
  generateInvoiceNumber() {
    if (!this.numero_factura) {
      const timestamp = Date.now();
      this.numero_factura = `FAC${timestamp.toString().slice(-8)}`;
    }
  }

  // Computed properties
  get profit_usd(): number {
    return this.detalles?.reduce((total, detail) => {
      const costPerUnit = detail.lote?.precio_costo_usd || 0;
      const profit = (detail.precio_unitario_usd - costPerUnit) * detail.cantidad;
      return total + profit;
    }, 0) || 0;
  }

  get profit_ves(): number {
    return Number((this.profit_usd * this.tasa_cambio_venta).toFixed(2));
  }

  getSummary() {
    return {
      numero_factura: this.numero_factura,
      fecha_venta: this.fecha_venta,
      totales: {
        usd: {
          subtotal: this.subtotal_usd,
          impuesto: this.impuesto_usd,
          descuento: this.descuento_usd,
          total: this.total_usd
        },
        ves: {
          subtotal: this.subtotal_ves,
          impuesto: this.impuesto_ves,
          descuento: this.descuento_ves,
          total: this.total_ves
        }
      },
      tasa_cambio: this.tasa_cambio_venta,
      metodo_pago: this.metodo_pago,
      estado: this.estado
    };
  }

  get tasa_cambio(): number {
    return this.tasa_cambio_venta; // Alias para compatibilidad
  }

  get tiene_pagos_multiples(): boolean {
    return this.detalles?.length > 1;
  }
}