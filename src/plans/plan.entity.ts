import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum PlanType {
  WIREGURD = 'WIREGURD',
  OPENVPN = 'OPENVPN'
}
@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column('')
  name?: string;

  @Column('')
  domain?: string;

  @Column('')
  ip?: string;

  @Column({ type: 'int', nullable: true })
  port?: number;

  // قیمت به تومان
  @Column('bigint')
  price: string;

  // مدت اعتبار به روز (اختیاری؛ اگر خالی باشد یعنی بدون انقضا)
  @Column({ nullable: true })
  validityDays?: number;
  @Column({
    type: 'enum',
    enum: PlanType,
    default: PlanType.OPENVPN,
  })
  status: PlanType;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
