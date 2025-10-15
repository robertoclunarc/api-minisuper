import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('tasas_cambio')
export class ExchangeRate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  tasa_bcv: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  tasa_paralelo: number;

  @Column({ length: 60, default: 'pydolar' })
  fuente: string;

  @CreateDateColumn()
  created_at: string;
}