import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Plan } from '../plans/plan.entity';

export enum PaymentStatus {
  PENDING  = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity()
export class Payment {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  planId: number;

  @ManyToOne(() => User)
  user: User;

  @ManyToOne(() => Plan)
  plan: Plan;

  @Column()
  amount: number;

  @Column({ default: false })
  approve: boolean;

  @Column({ type: 'text', nullable: true })
  receiptText?: string;

  @Column({ nullable: true })
  receiptImage?: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  // ─── فیلد جدید ───────────────────────────────────────────────
  // null = خرید جدید   |   عدد = ID کانفیگی که باید تمدید شود
  @Column({ type: 'int', nullable: true, default: null })
  renewConfigId: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
