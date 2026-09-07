import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { User } from '../users/entities/user.entity';
import { WebhookEvent } from './entities/webhook-event.entity';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { MockPaymentProvider } from './mock-payment.provider';
import { StripePaymentProvider } from './stripe-payment.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, WebhookEvent, User]),
    ConfigModule,
  ],
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('PAYMENT_PROVIDER') === 'stripe'
          ? new StripePaymentProvider(config)
          : new MockPaymentProvider(),
    },
  ],
})
export class BillingModule {}
