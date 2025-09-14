import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Sale } from './Sale';
import { CashRegisterClose } from './CashRegisterClose';

@Entity('cajas')
export class CashRegister {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  numero_caja: number;

  @Column({ length: 100 })
  nombre: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Sale, sale => sale.caja)
  ventas: Sale[];

  @OneToMany(() => CashRegisterClose, close => close.caja)
  cierres: CashRegisterClose[];
}