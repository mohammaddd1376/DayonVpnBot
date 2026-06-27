import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BotUpdate } from './bot.update';
import { UsersModule } from '../users/users.module';
import { PlansModule } from '../plans/plans.module';
import { AdminGuard } from 'src/common/guards/admin.guard';
import { PaymenModule } from '../payment/PlaymentModule';
import { session } from 'telegraf';
import { VpnConfigsModule } from 'src/vpn-configs/vpn-configs.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        token: config.get<string>('BOT_TOKEN') as string,
        middlewares: [
          session()
        ]
      }),
    }),
    UsersModule,
    PaymenModule,
    VpnConfigsModule,
    PlansModule,
  ],
  providers: [
    BotUpdate,
    AdminGuard,
  ],
})
export class BotModule { }
