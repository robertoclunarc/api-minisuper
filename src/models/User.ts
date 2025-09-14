import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { Sale } from './Sale';
import { CashRegisterClose } from './CashRegisterClose';
import { InventoryBatch } from './InventoryBatch';

export enum UserRole {
  ADMIN = 'admin',
  CASHIER = 'cajero'
}

@Entity('usuarios')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  username: string;

  @Column({ length: 255 })
  password: string;

  @Column({ length: 100 })
  nombre: string;

  @Column({ type: 'enum', enum: UserRole })
  rol: UserRole;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => Sale, sale => sale.usuario)
  ventas: Sale[];

  @OneToMany(() => CashRegisterClose, close => close.usuario)
  cierres: CashRegisterClose[];

  @OneToMany(() => InventoryBatch, batch => batch.usuario)
  lotes: InventoryBatch[];
}