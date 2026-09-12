import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { Plan, PLAN_LIMITS } from '../common/enums/plan.enum';
import { Role } from '../common/enums/role.enum';
import { User } from '../users/entities/user.entity';
import { CreateCheckoutSessionDto } from './dto/checkout-session.dto';
import {
  PAYMENT_PROVIDER,
  PaymentProvider,
} from './payment-provider.interface';
import { WebhookEvent } from './entities/webhook-event.entity';

@Injectable()
export class BillingService {
  private readonly logger = new Logger('BillingService');

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(WebhookEvent)
    private readonly webhookEvents: Repository<WebhookEvent>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @Inject(PAYMENT_PROVIDER) private readonly paymentProvider: PaymentProvider,
  ) {}

  /**
   * Only meaningful for a plan change the *user* is directly requesting right
   * now (the mock/immediate checkout path). It cannot be applied to a plan
   * change arriving via Stripe webhook (e.g. subscription.ended) - that
   * change already happened on Stripe's side and there is no request left to
   * reject. That path is instead covered defensively at staff login time
   * (see AuthService.login), which blocks staff (not owners) from logging
   * into a store that is currently over its plan's staff limit, regardless
   * of how it got that way.
   */
  private async assertStaffFitsPlan(
    storeId: string,
    plan: Plan,
  ): Promise<void> {
    const limit = PLAN_LIMITS[plan].maxStaff;
    const staffCount = await this.users.count({
      where: { storeId, role: Role.STAFF },
    });
    if (staffCount > limit) {
      throw new ConflictException(
        `Cannot switch to the ${plan} plan: this store currently has ${staffCount} staff member(s), but the ${plan} plan only allows ${limit}. Remove ${
          staffCount - limit
        } staff member(s) first, then try again.`,
      );
    }
  }

  async getSubscription(storeId: string): Promise<Subscription> {
    const subscription = await this.subscriptions.findOne({
      where: { storeId },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }

  async createCheckoutSession(
    storeId: string,
    dto: CreateCheckoutSessionDto,
  ): Promise<{ url: string }> {
    const result = await this.paymentProvider.createCheckoutSession({
      storeId,
      targetPlan: dto.targetPlan,
      successUrl: dto.successUrl,
      cancelUrl: dto.cancelUrl,
    });

    if (result.immediatePlan) {
      await this.assertStaffFitsPlan(storeId, result.immediatePlan);
      await this.applyPlanChange(storeId, result.immediatePlan);
    }

    return { url: result.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = await this.paymentProvider.handleWebhook(rawBody, signature);
    if (!event) return;

    // Idempotency: Stripe (and payment providers generally) can and do
    // redeliver the same event - on timeout, on a non-2xx response, or just
    // as a platform guarantee. Without this check, a redelivered
    // checkout.completed would be harmless here (it's just an UPDATE to the
    // same values), but a redelivered subscription.ended would too - the
    // real risk is any *future* handler here that isn't naturally
    // idempotent (e.g. "send a cancellation email") double-firing.
    const alreadyProcessed = await this.webhookEvents.findOne({
      where: { eventId: event.eventId },
    });
    if (alreadyProcessed) {
      this.logger.log(
        `Skipping already-processed webhook event ${event.eventId}`,
      );
      return;
    }

    if (event.type === 'checkout.completed') {
      await this.applyPlanChange(
        event.storeId,
        event.plan,
        event.providerCustomerId,
        event.providerSubscriptionId,
      );
    } else if (event.type === 'subscription.ended') {
      const subscription = await this.subscriptions.findOne({
        where: { stripeSubscriptionId: event.providerSubscriptionId },
      });
      if (!subscription) {
        this.logger.warn(
          `subscription.ended for unrecognized providerSubscriptionId ${event.providerSubscriptionId} - no matching store, nothing to revert`,
        );
      } else {
        await this.applyPlanChange(subscription.storeId, Plan.FREE);
      }
    }

    await this.webhookEvents.save({
      eventId: event.eventId,
      provider: 'stripe',
    });
  }

  private async applyPlanChange(
    storeId: string,
    plan: Subscription['plan'],
    stripeCustomerId?: string | null,
    stripeSubscriptionId?: string | null,
  ): Promise<void> {
    await this.subscriptions.update(
      { storeId },
      {
        plan,
        status: SubscriptionStatus.ACTIVE,
        ...(stripeCustomerId !== undefined ? { stripeCustomerId } : {}),
        ...(stripeSubscriptionId !== undefined ? { stripeSubscriptionId } : {}),
      },
    );
  }
}
