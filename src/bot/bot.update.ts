import { UseGuards } from '@nestjs/common';
import {
  Action,
  Ctx,
  Hears,
  On,
  Start,
  Update,
} from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { AdminGuard } from '../common/guards/admin.guard';
import { PaymentsService } from 'src/payment/payments.service';
import { VpnConfigsService } from 'src/vpn-configs/vpn-configs.service';
import { PaymentStatus } from 'src/payment/payment.entity';
import { VpnConfigStatus } from 'src/vpn-configs/vpn-config.entity';
import * as QRCode from 'qrcode';

const CARD_NUMBER = '6219861804173630';
const CARD_OWNER = 'محمدرضا آباده ای';
const ADMIN_ID = 506151576;

const MAIN_MENU = Markup.keyboard([
  ['🛒 خرید کانفیگ', '📂 کانفیگ‌های من'],
  ['📞 ارتباط با ادمین'],
]).resize();

enum PaymentType {
  NEW = 'new',
  RENEW = 'renew',
}

@Update()
export class BotUpdate {
  constructor(
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly paymentsService: PaymentsService,
    private readonly vpnConfigsService: VpnConfigsService,
  ) { }

  // ─────────────────────────────────────────────────────────────
  // /start
  // ─────────────────────────────────────────────────────────────

  @Start()
  async start(@Ctx() ctx: Context) {
    const user = ctx.from;
    if (user) {
      await this.usersService.findOrCreate(user.id, user.username, user.first_name);
    }
    await ctx.reply(
      `سلام ${user?.first_name} 👋\n\n` +
      `✨ به فروشگاه Dayon_Vpn خوش آمدید!\n\n` +
      `🛡 ارائه انواع سرویس‌های VPN با کیفیت عالی\n` +
      `✅ تضمین امنیت ارتباطات شما\n` +
      `📞 پشتیبانی حرفه‌ای ۲۴ ساعته\n\n` +
      `از منوی زیر بخش مورد نظر خود را انتخاب کنید.`,
      MAIN_MENU,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // خرید کانفیگ — نمایش پلن‌ها
  // ─────────────────────────────────────────────────────────────

  @Hears('🛒 خرید کانفیگ')
  async plans(@Ctx() ctx: Context) {
    const plans = await this.plansService.findAllActive();
    if (!plans.length) return ctx.reply('هیچ پلنی موجود نیست.');

    const buttons = plans.map((plan) => [
      Markup.button.callback(
        `${plan.name} — ${Number(plan.price).toLocaleString()} تومان`,
        `buy:${plan.id}`,
      ),
    ]);
    await ctx.reply('پلن مورد نظر را انتخاب کنید:', Markup.inlineKeyboard(buttons));
  }


  // ─────────────────────────────────────────────────────────────
  // کانفیگ‌های من
  // ─────────────────────────────────────────────────────────────

  @Hears('📂 کانفیگ‌های من')
  async myConfigs(@Ctx() ctx: Context) {
    const user = await this.usersService.findByTelegramId(ctx.from!.id);
    if (!user) return ctx.reply('لطفا ابتدا دستور /start را ارسال کنید.');

    const configs = await this.vpnConfigsService.findUserConfigs(user.id);


    if (!configs.length) {
      return ctx.reply('شما هنوز هیچ کانفیگی نخریده‌اید.');
    }

    for (const c of configs) {
      const statusEmoji = c.status === VpnConfigStatus.ACTIVE ? '🟢 فعال' : '🔴 حذف‌شده';

      const now = new Date();
      if (!c.expiresAt) {
        return
      }
      const expiresAt = new Date(c.expiresAt);

      const remainingDays = Math.max(
        0,
        Math.ceil(
          (expiresAt.getTime() - now.getTime()) /
          (1000 * 60 * 60 * 24)
        )
      );

      const createdAt = new Date(c.createdAt);
      const expireDate = new Date(createdAt);
      const buttons =
        c.status === VpnConfigStatus.ACTIVE
          ? Markup.inlineKeyboard([
            Markup.button.callback('🗑 حذف   کانفیگ', `remove_config:${c.id}`),
            Markup.button.callback('🔄 تمدید', `renew:${c.id}`),
            Markup.button.callback('📱 QR Code', `qr_config:${c.id}`)
          ])
          : undefined;

      await ctx.reply(
        `${statusEmoji}                               شناسه: ${c.publicKey}\n` +
        `تاریخ خرید: ${c.createdAt.toLocaleDateString('fa-IR')}           روزهای باقی‌مانده: ${remainingDays}\n`,
        buttons,
      );
    }
  }

  // ─── انتخاب پلن (خرید جدید) ──────────────────────────────────

  @Action(/^buy:(.+)$/)
  async selectPlan(@Ctx() ctx: any) {
    const planId = Number(ctx.match[1]);
    const plan = await this.plansService.findActiveById(planId);
    if (!plan) return ctx.answerCbQuery('پلن پیدا نشد');

    await ctx.answerCbQuery();
    await ctx.reply(
      `💳 پرداخت\n\n` +
      `📦 پلن: ${plan.name}\n` +
      `💰 مبلغ: ${Number(plan.price).toLocaleString()} تومان\n\n` +
      `👤 صاحب کارت: ${CARD_OWNER}\n` +
      `💳 شماره کارت: ${CARD_NUMBER}\n\n` +
      `پس از پرداخت، عکس رسید یا متن رسید را ارسال کنید.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 کپی شماره کارت', copy_text: { text: CARD_NUMBER } }],
            [{ text: '❌ لغو', callback_data: 'cancel_payment' }],
          ],
        },
      },
    );

    ctx.session = ctx.session || {};
    ctx.session.planId = plan.id;
    ctx.session.paymentType = PaymentType.NEW;
    ctx.session.renewConfigId = null;
  }

  // ─────────────────────────────────────────────────────────────
  // تمدید کانفیگ — فقط درخواست رسید، بدون ساخت کانفیگ جدید
  // ─────────────────────────────────────────────────────────────

  @Action(/^renew:(.+)$/)
  async renewRequest(@Ctx() ctx: any) {
    const configId = Number(ctx.match[1]);
    await ctx.answerCbQuery();

    const config = await this.vpnConfigsService.findById(configId);
    if (!config) return ctx.reply('⚠️ کانفیگ پیدا نشد.');

    const plan = config.planId
      ? await this.plansService.findActiveById(config.planId)
      : null;
    const price = plan?.price ?? config.pricePaid;

    await ctx.reply(
      `🔄 تمدید کانفیگ\n\n` +
      `🔑 کانفیگ: ${config.publicKey}\n` +
      `💰 مبلغ تمدید: ${Number(price).toLocaleString()} تومان\n\n` +
      `👤 صاحب کارت: ${CARD_OWNER}\n` +
      `💳 شماره کارت: ${CARD_NUMBER}\n\n` +
      `پس از پرداخت، عکس رسید یا متن رسید را ارسال کنید.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 کپی شماره کارت', copy_text: { text: CARD_NUMBER } }],
            [{ text: '❌ لغو', callback_data: 'cancel_payment' }],
          ],
        },
      },
    );

    ctx.session = ctx.session || {};
    ctx.session.paymentType = PaymentType.RENEW;
    ctx.session.renewConfigId = configId;        // ← ID کانفیگ موجود
    ctx.session.renewPrice = price;
    ctx.session.planId = config.planId;
  }

  // ─────────────────────────────────────────────────────────────
  // لغو
  // ─────────────────────────────────────────────────────────────

  @Action('cancel_payment')
  async cancel(@Ctx() ctx: any) {
    ctx.session = ctx.session || {};
    ctx.session.planId = null;
    ctx.session.renewConfigId = null;
    ctx.session.paymentType = null;
    await ctx.answerCbQuery();
    await ctx.reply('❌ لغو شد.', MAIN_MENU);
  }

  // ─────────────────────────────────────────────────────────────
  // دریافت عکس رسید
  // ─────────────────────────────────────────────────────────────

  @On('photo')
  async photo(@Ctx() ctx: any) {
    if (!ctx.session?.planId && !ctx.session?.renewConfigId) return;

    const user = await this.usersService.findByTelegramId(ctx.from.id.toString());
    if (!user) return ctx.reply('لطفا ابتدا /start را بزنید.');

    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const payment = await this.createPaymentFromSession(ctx, user.id, fileId, null);
    if (!payment) return;

    await ctx.reply('✅ رسید دریافت شد.\n\nپس از تایید ادمین، نتیجه اعلام می‌شود.');
    await this.notifyAdmin(ctx, payment);
    this.clearSession(ctx);
  }

  // ─────────────────────────────────────────────────────────────
  // دریافت متن رسید
  // ─────────────────────────────────────────────────────────────

  @On('text')
  async text(@Ctx() ctx: any) {
    if (!ctx.session?.planId && !ctx.session?.renewConfigId) return;

    const user = await this.usersService.findByTelegramId(ctx.from.id.toString());
    if (!user) return ctx.reply('لطفا ابتدا /start را بزنید.');

    const payment = await this.createPaymentFromSession(ctx, user.id, null, ctx.message.text);
    if (!payment) return;

    await ctx.reply('✅ رسید دریافت شد.\n\nپس از بررسی ادمین نتیجه اعلام می‌شود.');
    await this.notifyAdmin(ctx, payment);
    this.clearSession(ctx);
  }

  // ─────────────────────────────────────────────────────────────
  // تایید پرداخت توسط ادمین
  // ─────────────────────────────────────────────────────────────

  @Action(/^fullPayment_ok:(.+)$/)
  @UseGuards(AdminGuard)
  async approve(@Ctx() ctx: any) {
    const paymentId = Number(ctx.match[1]);

    const payment = await this.paymentsService.findoneById(paymentId);
    if (!payment) return ctx.answerCbQuery('⚠️ پرداخت پیدا نشد.');
    if (payment.status !== PaymentStatus.PENDING) {
      return ctx.answerCbQuery('این پرداخت قبلاً بررسی شده است.');
    }

    await ctx.answerCbQuery('✅ در حال پردازش...');
    await this.paymentsService.approve(paymentId);

    // ─── تمدید: renewConfigId دارد ────────────────────────────
    if (payment.renewConfigId) {
      await this.handleRenewal(ctx, payment);
    }
    // ─── خرید جدید ────────────────────────────────────────────
    else {
      await this.handleNewPurchase(ctx, payment);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // رد پرداخت توسط ادمین
  // ─────────────────────────────────────────────────────────────

  @Action(/^fullPayment_no:(.+)$/)
  @UseGuards(AdminGuard)
  async reject(@Ctx() ctx: any) {
    const paymentId = Number(ctx.match[1]);

    const payment = await this.paymentsService.findoneById(paymentId);
    if (!payment) return ctx.answerCbQuery('پرداخت پیدا نشد.');
    if (payment.status !== PaymentStatus.PENDING) {
      return ctx.answerCbQuery('این پرداخت قبلاً بررسی شده است.');
    }
    const user = await this.usersService.findById(payment.userId)
    await this.paymentsService.reject(paymentId);
    await ctx.answerCbQuery('❌ رد شد.');
    await ctx.telegram.sendMessage(
      user?.telegramId,
      '❌ متأسفانه رسید شما تأیید نشد.\n\nلطفاً با ادمین تماس بگیرید: @your_admin',
    );
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
    await ctx.reply(`❌ پرداخت #${paymentId} رد شد.`);
  }


  // ─────────────────────────────────────────────────────────────
  // حذف کانفیگ
  // ─────────────────────────────────────────────────────────────

  @Action(/^remove_config:(.+)$/)
  async removeConfig(@Ctx() ctx: any) {
    const configId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    await ctx.reply(
      'آیا مطمئن هستید؟',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ بله، حذف شود', `confirm_remove:${configId}`),
          Markup.button.callback('❌ خیر', 'cancel_remove'),
        ],
      ]),
    );
  }
  @Action(/^qr_config:(.+)$/)
  async qrConfig(@Ctx() ctx: any) {

    const configId = Number(ctx.match[1]);

    const config = await this.vpnConfigsService.findById(configId)

    if (!config) {
      return ctx.answerCbQuery('کانفیگ پیدا نشد');
    }

    const qrBuffer = await QRCode.toBuffer(config.rawConfig);

    await ctx.replyWithPhoto(
      { source: qrBuffer },
      {
        caption: `QR Code کانفیگ ${config.publicKey}`,
      },
    );

    await ctx.answerCbQuery();
  }
  @Action(/^confirm_remove:(.+)$/)
  async confirmRemove(@Ctx() ctx: any) {
    const configId = Number(ctx.match[1]);
    await ctx.answerCbQuery();
    await this.vpnConfigsService.removeConfig(configId);
    await ctx.reply('🗑 کانفیگ حذف شد.');
  }

  @Action('cancel_remove')
  async cancelRemove(@Ctx() ctx: any) {
    await ctx.answerCbQuery();
    await ctx.reply('عملیات لغو شد.');
  }

  // ─────────────────────────────────────────────────────────────
  // ارتباط با ادمین
  // ─────────────────────────────────────────────────────────────

  @Hears('📞 ارتباط با ادمین')
  async adminContact(@Ctx() ctx: Context) {
    await ctx.reply('📞 برای ارتباط با ادمین: @your_admin');
  }

  // ═════════════════════════════════════════════════════════════
  // متدهای کمکی
  // ═════════════════════════════════════════════════════════════

  private async createPaymentFromSession(
    ctx: any,
    userId: number,
    receiptImage: string | null,
    receiptText: string | null,
  ) {
    const session = ctx.session || {};
    const paymentType = session.paymentType as PaymentType;
    const planId = session.planId;
    const renewConfigId = session.renewConfigId;

    if (!planId) {
      await ctx.reply('⚠️ خطا: پلن انتخاب نشده. لطفاً دوباره از منو شروع کنید.');
      return null;
    }

    const plan = await this.plansService.findActiveById(planId);
    if (!plan) {
      await ctx.reply('⚠️ پلن پیدا نشد.');
      return null;
    }

    const amount = paymentType === PaymentType.RENEW && session.renewPrice
      ? session.renewPrice
      : plan.price;

    const payment = await this.paymentsService.create({
      userId,
      planId,
      amount,
      receiptImage: receiptImage || undefined,
      receiptText: receiptText || undefined,
      renewConfigId: paymentType === PaymentType.RENEW ? renewConfigId : null,
      approve: false,
    });

    return this.paymentsService.findoneById(payment.id);
  }

  private async notifyAdmin(ctx: any, payment: any) {
    const tgUser = ctx.from!;
    const isRenew = !!payment.renewConfigId;
    const typeLabel = isRenew ? '🔄 تمدید کانفیگ' : '🛒 خرید جدید';

    const text =
      `${typeLabel}\n\n` +
      `👤 کاربر: @${tgUser.username ?? tgUser.first_name}\n` +
      `🆔 تلگرام: ${tgUser.id}\n` +
      `💰 مبلغ: ${Number(payment.amount).toLocaleString()} تومان` +
      (isRenew ? `\n🔑 شناسه کانفیگ: ${payment.renewConfigId}` : '');

    const buttons = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ تایید', `fullPayment_ok:${payment.id}`),
        Markup.button.callback('❌ رد', `fullPayment_no:${payment.id}`),
      ],
    ]);

    if (payment.receiptImage) {
      await ctx.telegram.sendPhoto(ADMIN_ID, payment.receiptImage, {
        caption: text,
        reply_markup: buttons.reply_markup,
      });
    } else {
      await ctx.telegram.sendMessage(
        ADMIN_ID,
        text + `\n\n📝 متن رسید:\n${payment.receiptText}`,
        { reply_markup: buttons.reply_markup },
      );
    }
  }

  // ─── تمدید: فقط تاریخ انقضا آپدیت می‌شود ─────────────────────

  private async handleRenewal(ctx: any, payment: any) {
    const configId = payment.renewConfigId;

    const updatedConfig = await this.vpnConfigsService.renew(configId, payment.planId);
    const user = await this.usersService.findById(payment.userId)

    const newExpiry = updatedConfig.expiresAt
      ? new Date(updatedConfig.expiresAt).toLocaleDateString()
      : 'نامشخص';

    await ctx.telegram.sendMessage(
      user?.telegramId,
      `✅ کانفیگ شما با موفقیت تمدید شد!\n\n` +
      `🔑 کانفیگ: ${updatedConfig.publicKey}\n` +
      `📅 تاریخ انقضای جدید: ${newExpiry}\n\n` +
      `از اعتماد شما متشکریم 🙏`,
    );

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
    await ctx.reply(`✅ تمدید کانفیگ #${configId} اعمال شد.`);
  }

  // ─── خرید جدید: کانفیگ جدید ساخته و ارسال می‌شود ──────────────

  private async handleNewPurchase(ctx: any, payment: any) {
    const config = await this.vpnConfigsService.purchase(payment.userId, payment.planId);
    const user = await this.usersService.findById(config.userId);

    if (!config.rawConfig || !user) {
      await ctx.telegram.sendMessage(
        payment.user.telegramId,
        '⚠️ خطا در ساخت کانفیگ. لطفاً با ادمین تماس بگیرید.',
      );
      return;
    }

    const qrBuffer = await QRCode.toBuffer(config.rawConfig);

    await ctx.telegram.sendPhoto(
      user.telegramId,
      { source: qrBuffer },
      { caption: '📱 QR Code کانفیگ شما' },
    );

    await ctx.telegram.sendDocument(
      user.telegramId,
      {
        source: Buffer.from(config.rawConfig, 'utf-8'),
        filename: `${config.publicKey}.conf`,
      },
      {
        caption: `✅ کانفیگ شما آماده است!\n\n🔑 ${config.publicKey}`,
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔄 تمدید', `renew:${config.id}`)],
        ]).reply_markup,
      },
    );

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => { });
    await ctx.reply('✅ خرید جدید تأیید و کانفیگ ارسال شد.');
  }

  private clearSession(ctx: any) {
    ctx.session = ctx.session || {};
    ctx.session.planId = null;
    ctx.session.paymentType = null;
    ctx.session.renewConfigId = null;
    ctx.session.renewPrice = null;
  }
}
