import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { Product } from './Product';
import { InventoryBatch } from './InventoryBatch';

@Entity('proveedores')
export class Provider {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 150 })
  nombre: string;

  @Column({ length: 100, nullable: true })
  contacto: string;

  @Column({ length: 20, nullable: true })
  telefono: string;

  @Column({ length: 100, nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  direccion: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => Product, product => product.proveedor)
  productos: Product[];

  @OneToMany(() => InventoryBatch, batch => batch.proveedor)
  lotes: InventoryBatch[];
}