import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { VpnConfig, VpnConfigStatus } from './vpn-config.entity';
import { PlansService } from '../plans/plans.service';
import { VpnApiClient } from './vpn-api.client';
import axios from 'axios';

@Injectable()
export class VpnConfigsService {
  constructor(
    @InjectRepository(VpnConfig)
    private readonly repo: Repository<VpnConfig>,
    private readonly plansService: PlansService,
    private readonly vpnApiClient: VpnApiClient,
    private readonly dataSource: DataSource,
  ) {}

  // ──────────────────────────────────────────────────────────────
  // خرید جدید کانفیگ
  // ──────────────────────────────────────────────────────────────

  async purchase(userId: number, planId: number): Promise<VpnConfig> {

    const plan = await this.plansService.findActiveById(planId);
   
    if (!plan) {
      throw new NotFoundException('این پلن دیگر موجود نیست.');
    }

    return this.dataSource.transaction(async (manager) => {
      const publicKey = this.generatePublicKey();
      const ip = plan.ip;
      const domain= plan.domain;

      if (!ip || !domain) {
        throw new InternalServerErrorException(
          'برای این پلن IP سرور وایرگارد تنظیم نشده است.',
        );
      }

      let rawConfig: string;
      try {
        const res = await axios.get(
          `http://${ip}:${plan.port}/create?publicKey=${publicKey}`,
        );
        rawConfig = this.modifyConfig(res.data, domain);
      } catch {
        throw new InternalServerErrorException(
          'خطا در ارتباط با سرور وایرگارد. لطفاً چند دقیقه دیگر دوباره تلاش کنید.',
        );
      }

      const expiresAt = plan.validityDays
        ? new Date(Date.now() + plan.validityDays * 24 * 60 * 60 * 1000)
        : undefined;

      const config = manager.create(VpnConfig, {
        userId,
        planId: plan.id,
        publicKey,
        rawConfig,
        pricePaid: plan.price,
        expiresAt,
      });

      return manager.save(config);
    });
  }

  // ──────────────────────────────────────────────────────────────
  // تمدید کانفیگ
  // فقط تاریخ انقضا را در DB اضافه می‌کند — بدون هیچ تماس API خارجی
  // ──────────────────────────────────────────────────────────────

  async renew(configId: number, planId: number): Promise<VpnConfig> {
    const config = await this.repo.findOne({ where: { id: configId } });
    if (!config) {
      throw new NotFoundException('کانفیگ یافت نشد.');
    }

    const plan = await this.plansService.findActiveById(planId);
    if (!plan) {
      throw new NotFoundException('پلن یافت نشد.');
    }

    const validityDays = plan.validityDays ?? 30;

    // اگر تاریخ انقضا هنوز در آینده است، از آن نقطه اضافه می‌شود
    // اگر منقضی شده یا اصلاً تاریخ نداشت، از همین لحظه حساب می‌شود
    const baseDate =
      config.expiresAt && config.expiresAt > new Date()
        ? config.expiresAt
        : new Date();

    const newExpiresAt = new Date(
      baseDate.getTime() + validityDays * 24 * 60 * 60 * 1000,
    );

    await this.repo.update(configId, {
      expiresAt: newExpiresAt,
      status: VpnConfigStatus.ACTIVE,
    });

    const updated = await this.repo.findOne({ where: { id: configId } });
    if (!updated) throw new NotFoundException('کانفیگ پس از تمدید یافت نشد.');
    return updated;
  }

  // ──────────────────────────────────────────────────────────────
  // پیدا کردن یک کانفیگ با ID
  // ──────────────────────────────────────────────────────────────

  async findById(id: number): Promise<VpnConfig | null> {
    return this.repo.findOne({ where: { id } });
  }

  // ──────────────────────────────────────────────────────────────
  // حذف کانفیگ
  // ──────────────────────────────────────────────────────────────

  async removeConfig(configId: number, userId?: number): Promise<void> {
    const where: any = { id: configId };
    if (userId) where.userId = userId;

    const config = await this.repo.findOne({ where });
    if (!config) {
      throw new NotFoundException('کانفیگ یافت نشد.');
    }

    if (config.status === VpnConfigStatus.REMOVED) return;

    if (config.planId) {
      const plan = await this.plansService.findActiveById(config.planId);
      if (plan?.ip) {
        await this.vpnApiClient.removePeer(config.publicKey, plan.ip);
      }
    }

    config.status = VpnConfigStatus.REMOVED;
    await this.repo.save(config);
  }

  // ──────────────────────────────────────────────────────────────
  // لیست کانفیگ‌های یک کاربر
  // ──────────────────────────────────────────────────────────────

  findUserConfigs(userId: number): Promise<VpnConfig[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  // ──────────────────────────────────────────────────────────────
  // لیست همه کانفیگ‌های فعال
  // ──────────────────────────────────────────────────────────────

  findAllActive(): Promise<VpnConfig[]> {
    return this.repo.find({
      where: { status: VpnConfigStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  // ──────────────────────────────────────────────────────────────
  // متدهای کمکی (private)
  // ──────────────────────────────────────────────────────────────

  private modifyConfig(config: string, domain: string): string {
    let lines = config.split('\n');

    const interfaceIndex = lines.findIndex((l) => l.startsWith('[Interface]'));

    // اضافه کردن MTU بعد از [Interface] اگر نبود
    if (!lines.includes('MTU = 1280') && interfaceIndex !== -1) {
      lines.splice(interfaceIndex + 4, 0, 'MTU = 1280');
    }

    // پس از splice، index پیر جابجا شده — دوباره پیدا می‌کنیم
    const peerIndex = lines.findIndex((l) => l.startsWith('[Peer]'));

    // اضافه کردن PersistentKeepalive بعد از [Peer] اگر نبود
    if (!lines.includes('PersistentKeepalive = 21') && peerIndex !== -1) {
      lines.splice(peerIndex + 4, 0, 'PersistentKeepalive = 21');
    }

    // جایگزینی IP در Endpoint با دامنه — پورت حفظ می‌شود
    const endpointIndex = lines.findIndex((l) => l.startsWith('Endpoint ='));
    if (endpointIndex !== -1) {
      const port = lines[endpointIndex].split(':').pop();
      lines[endpointIndex] = `Endpoint = ${domain}:${port}`;
    }

    return lines.join('\n');
  }

  private generatePublicKey(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `w${result}`;
  }
}
