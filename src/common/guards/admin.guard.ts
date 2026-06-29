import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegrafExecutionContext } from 'nestjs-telegraf';
import { Context } from 'telegraf';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) { }

  canActivate(context: ExecutionContext): boolean {
    const ctx = TelegrafExecutionContext.create(context).getContext<Context>();
    const adminIds = '506151576'
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const fromId = ctx.from?.id?.toString();
    return !!fromId && adminIds.includes(fromId);
  }
}
