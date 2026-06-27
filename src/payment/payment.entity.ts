import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';

// import { User } from '../../users/entities/user.entity';
import { User } from '../users/user.entity';
import { Plan } from '../plans/plan.entity';


export enum PaymentStatus {
  PENDING = 'PENDING',
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


  // متن رسید
  @Column({
    type: 'text',
    nullable: true,
  })
  receiptText?: string;


  // عکس رسید تلگرام
  @Column({
    nullable: true,
  })
  receiptImage?: string;


  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;


  @CreateDateColumn()
  createdAt: Date;

}