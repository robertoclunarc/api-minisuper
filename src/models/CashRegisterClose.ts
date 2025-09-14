import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { CashRegister } from './CashRegister';
import { User } from './User';
import { Sale } from './Sale';

export enum CashRegisterStatus {
  OPEN = 'abierto',
  CLOSED = 'cerrado'
}

@Entity('cierres_caja')
export class CashRegisterClose {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  caja_id: number;

  @Column()
  usuario_id: number;

  @CreateDateColumn()
  fecha_apertura: Date;

  @Column({ nullable: true })
  fecha_cierre: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_inicial_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  monto_inicial_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  monto_final_usd: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  monto_final_ves: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total_ventas: number;

  @Column({ default: 0 })
  total_transacciones: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  tasa_cambio_apertura: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  tasa_cambio_cierre: number;

  @Column({ type: 'enum', enum: CashRegisterStatus, default: CashRegisterStatus.OPEN })
  estado: CashRegisterStatus;

  @Column({ type: 'text', nullable: true })
  observaciones: string;

  @ManyToOne(() => CashRegister, cashRegister => cashRegister.cierres)
  @JoinColumn({ name: 'caja_id' })
  caja: CashRegister;

  @ManyToOne(() => User, user => user.cierres)
  @JoinColumn({ name: 'usuario_id' })
  usuario: User;

  @OneToMany(() => Sale, sale => sale.cierre_caja)
  ventas: Sale[];

  // Computed properties
  get duracion_minutos(): number {
    if (!this.fecha_cierre) return 0;
    return Math.floor((this.fecha_cierre.getTime() - this.fecha_apertura.getTime()) / (1000 * 60));
  }

  get promedio_venta(): number {
    return this.total_transacciones > 0 ? this.total_ventas / this.total_transacciones : 0;
  }

  get diferencia_caja_usd(): number {
    return this.monto_final_usd - (this.monto_inicial_usd + this.total_ventas);
  }
}