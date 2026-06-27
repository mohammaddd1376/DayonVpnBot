import { OnModuleInit, UseGuards } from '@nestjs/common';
import {
  Action,
  Command,
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
import { fmt } from 'telegraf/format';


const CARD_NUMBER = 6219861804173630
const CARD_OWNER = "محمدرضا آباده ای"


const MAIN_MENU = Markup.keyboard([
  ['🛒 خرید کانفیگ', 'کانفیگ‌های من'],
  ['📂 کانفیگ‌های من'],
  ['📞 ارتباط با ادمین'],
])
  .resize();



@Update()
export class BotUpdate {


  constructor(

    private readonly usersService: UsersService,

    private readonly plansService: PlansService,

    private readonly paymentsService: PaymentsService,

    private readonly vpnConfigsService: VpnConfigsService,

  ) { }



  //
  // شروع ربات
  //

  @Start()
  async start(
    @Ctx() ctx: Context
  ) {

    const user = ctx.from;
    if (user)

      await this.usersService.findOrCreate(
        user.id,
        user.username,
        user.first_name
      );


    await ctx.reply(
      `
سلام ${user?.first_name}
✨ به فروشگاه Dayon_Vpn خوش آمدید!

🛡 ارائه انواع سرویس‌های VPN با کیفیت عالی
✅ تضمین امنیت ارتباطات شما
📞 پشتیبانی حرفه‌ای ۲۴ ساعته

از منوی زیر بخش مورد نظر خود را انتخاب کنید.
`,
      MAIN_MENU
    );


  }



  //
  // نمایش پلن ها
  //

  @Hears('🛒 خرید کانفیگ')
  async plans(
    @Ctx() ctx: Context
  ) {


    const plans =
      await this.plansService.findAllActive();


    if (!plans.length)
      return ctx.reply(
        'هیچ پلنی موجود نیست.'
      );



    const buttons =
      plans.map(plan => [

        Markup.button.callback(
          `${plan.name} - ${plan.price} تومان`,
          `buy:${plan.id}`
        )

      ]);



    await ctx.reply(
      'پلن مورد نظر را انتخاب کنید:',
      Markup.inlineKeyboard(buttons)
    );


  }
  // انتخاب پلن
  @Action(/^buy:(.+)$/)
  async selectPlan(
    @Ctx() ctx: any
  ) {


    const planId =
      Number(ctx.match[1]);



    const plan =
      await this.plansService.findActiveById(planId);



    if (!plan)
      return ctx.answerCbQuery(
        'پلن پیدا نشد'
      );



    await ctx.answerCbQuery();



    await ctx.reply(
      `
💳 پرداخت

پلن:
${plan.name}

${plan.price}  تومان
${CARD_OWNER}
${CARD_NUMBER}

بعد از پرداخت:
عکس رسید یا متن رسید را ارسال کنید.
`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📋 شماره کارت',
                copy_text: {
                  text: CARD_NUMBER,
                },
              },
            ],
            [
              {
                text: '❌ لغو',
                callback_data: 'cancel_payment',
              },
            ],
          ],
        },
      },
    );
    ctx.session = ctx.session || {};
    ctx.session.planId = plan.id;
  }

  // لغو
  @Action('cancel_payment')
  async cancel(
    @Ctx() ctx: any
  ) {

    await ctx.answerCbQuery();

    await ctx.reply(
      'لغو شد.'
    );

  }

  // دریافت عکس رسید
  //

  @On('photo')
  async photo(
    @Ctx() ctx: any
  ) {

    if (!ctx.session?.planId) {

      return;
    }



    const user =
      await this.usersService.findByTelegramId(
        ctx.from.id.toString()
      );



    const fileId =
      ctx.message.photo[
        ctx.message.photo.length - 1
      ].file_id;

    const plan =
      await this.plansService.findActiveById(
        ctx.session.planId
      );


    if (!plan) {
      return ctx.reply('پلن پیدا نشد');
    }

    const payment =
      await this.paymentsService.create({
        userId: user?.id,
        amount: plan?.price,
        planId: plan.id,
        receiptImage: fileId
      });


    await ctx.reply(
      `
✅ رسید دریافت شد.

پس از تایید ادمین کانفیگ ساخته می‌شود.
`
    );

    await this.sendAdmin(
      ctx,
      payment
    );



  }
  // دریافت متن رسید

  // ارسال رسید برای ادمین
  //
  async sendAdmin(
    ctx: any,
    fullPayment: any
  ) {
    const ADMIN_ID = 124723226;
    const tgUser = ctx.from!;
    const buttons =
      Markup.inlineKeyboard([

        [
          Markup.button.callback(
            '✅ تایید',
            `fullPayment_ok:${fullPayment.id}`
          ),

          Markup.button.callback(
            '❌ رد',
            `fullPayment_no:${fullPayment.id}`
          )

        ]

      ]);

    const text =
      `
کاربر:
${tgUser.username}
مبلغ:
${fullPayment.amount}
`;

    if (fullPayment.receiptImage) {
      await ctx.telegram.sendPhoto(
        ADMIN_ID,
        fullPayment.receiptImage,
        {
          caption: text,
          reply_markup:
            buttons.reply_markup
        }
      );
    }
    else {


      await ctx.telegram.sendMessage(
        ADMIN_ID,

        text +

        `

     📝 رسید:

      ${fullPayment.receiptText}
             `,

        {
          reply_markup:
            buttons.reply_markup
        }

      );
    }
  }
  @Action(/^fullPayment_ok:(.+)$/)
  @UseGuards(AdminGuard)
  async approve(
    @Ctx() ctx: any
  ) {
    const tgUser = ctx.from!;
    const id =
      Number(ctx.match[1]);
    const payment2 =
      await this.paymentsService.findoneById(id)
    if (!payment2) {
      return await ctx.answerCbQuery('پرداخت پیدا نشد.');
    }
    if (payment2.status === PaymentStatus.PENDING) {
      await ctx.answerCbQuery(
        'تایید شد'
      );
      const payment =
        await this.paymentsService.approve(id);
      await ctx.telegram.sendMessage(
        tgUser.id,
        `✅ پرداخت تایید شد.`
      )
      const config = await this.vpnConfigsService.purchase(payment.userId, payment.planId);
      if (!config.rawConfig) {
        throw new Error('Raw config not found');
      }
      await ctx.telegram.sendDocument(
        payment.user.telegramId,
        {
          source: Buffer.from(config.rawConfig, 'utf-8'),
          filename: `${config.publicKey}.conf`,
        },
        {
          caption: `کانفیگ شما (${config.publicKey}) آماده است.`,
        },
      );
    } else {
      await ctx.answerCbQuery(
        'قبلا تایید یا رد'
      );
    }
  }

  //
  // رد پرداخت
  //

  @Action(/^payment_no:(.+)$/)
  @UseGuards(AdminGuard)
  async reject(
    @Ctx() ctx: any
  ) {


    await this.paymentsService.reject(
      Number(ctx.match[1])
    );



    await ctx.answerCbQuery(
      'رد شد'
    );


  }

  @Hears('کانفیگ‌های من')
  async myConfigs(@Ctx() ctx: Context) {
    const user = await this.usersService.findByTelegramId(ctx.from!.id);
    if (!user) return ctx.reply('لطفا ابتدا دستور /start را ارسال کنید.');
    const configs = await this.vpnConfigsService.findUserConfigs(user.id);
    if (!configs.length) {
      ctx.reply('شما هنوز هیچ کانفیگی نخریده‌اید.');
      return
    }
    for (const c of configs) {
      const statusEmoji = c.status === VpnConfigStatus.ACTIVE ? '🟢 فعال' : '🔴 حذف‌شده';
      const buttons =
        c.status === VpnConfigStatus.ACTIVE
          ? Markup.inlineKeyboard([
            Markup.button.callback('🗑 حذف این کانفیگ', `remove_config:${c.id}`),
          ])
          : undefined;

      await ctx.reply(
        `${statusEmoji}\n` +
        `🔑 شناسه: ${c.publicKey}     💰 قیمت: ${fmt(c.pricePaid)} تومان\n` +
        `📅 تاریخ خرید: ${c.createdAt.toLocaleDateString('fa-IR')}`,
        buttons,
      );
    }
  }
  @Hears('📞 ارتباط با ادمین')
  async admin(
    @Ctx() ctx: Context
  ) {

    await ctx.reply(
      'ارتباط با ادمین: @your_admin'
    );

  }
  @On('text')
  async text(
    @Ctx() ctx: any
  ) {

    if (!ctx.session?.planId)
      return;



    const user =
      await this.usersService.findByTelegramId(
        ctx.from.id.toString()
      );
    const plan = await this.plansService.findActiveById(ctx.session.planId);

    if (!plan) {
      return ctx.reply('پلن پیدا نشد');
    }
    const payment = await this.paymentsService.create({
      userId: user!.id,
      planId: plan.id,
      amount: plan.price,
      receiptText: ctx.message.text,
    });
    await ctx.reply(
      `
✅ رسید دریافت شد.

پس از بررسی ادمین نتیجه اعلام می‌شود.
`
    );

    const fullPayment =
      await this.paymentsService.findoneById(payment.id)
    await this.sendAdmin(
      ctx,
      fullPayment
    );
  }

}