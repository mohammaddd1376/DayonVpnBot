import { VpnConfig } from 'src/vpn-configs/vpn-config.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  // شناسه عددی تلگرام کاربر (به‌صورت رشته ذخیره می‌شود تا از مشکلات دقت عددی جلوگیری شود)
  @Column('bigint')
  telegramId: number;

  @Column({ nullable: true })
  username?: string;

  @Column({ nullable: true })
  firstName?: string;

  // موجودی کیف پول به تومان، بدون اعشار


  @Column('bigint', { default: 0 })
  balance: string;

  @Column({ default: false })
  isBlocked: boolean;

  @CreateDateColumn({})
  createdAt: Date;

  @OneToMany(() => VpnConfig, (c) => c.user)
  vpnConfigs: VpnConfig[];

}
