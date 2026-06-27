import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { VpnConfig } from './vpn-config.entity';
import { VpnConfigsService } from './vpn-configs.service';
import { VpnApiClient } from './vpn-api.client';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VpnConfig]),
    HttpModule.register({ timeout: 10000, maxRedirects: 3 }),
    PlansModule,
  ],
  providers: [VpnConfigsService, VpnApiClient],
  exports: [VpnConfigsService],
})
export class VpnConfigsModule {}
