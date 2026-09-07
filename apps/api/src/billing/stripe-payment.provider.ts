import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// See the class doc comment below: `import Stripe from 'stripe'` compiles to
// a broken `.default` reference without esModuleInterop, which this project
// deliberately doesn't set. This require-equals form is the correct fix,
// not a shortcut.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require('stripe');
import { Plan } from '../common/enums/plan.enum';
import {
  CheckoutSessionParams,
  CheckoutSessionResult,
  PaymentProvider,
  WebhookEvent,
} from './payment-provider.interface';

/**
 * Real Stripe Checkout in test mode. Requires STRIPE_SECRET_KEY and
 * STRIPE_WEBHOOK_SECRET (see .env.example).
 *
 * Webhook signature verification and event parsing (handleWebhook) - for
 * both checkout.session.completed and customer.subscription.deleted - was
 * verified end-to-end in this sandbox using Stripe's own
 * generateTestHeaderString test helper: that's pure local HMAC
 * signing/verification, no network call, confirming a validly-signed event
 * of each type is parsed correctly and a forged/missing signature is
 * rejected with 400 (see billing.service.spec.ts and
 * stripe-payment.provider.spec.ts). This also caught a real bug: `import
 * Stripe from 'stripe'` silently compiled to a broken `.default` reference
 * and crashed the app on startup, since this project doesn't set
 * esModuleInterop; fixed via `import Stripe = require('stripe')`.
 *
 * createCheckoutSession was NOT live-tested - it calls stripe.checkout.
 * sessions.create, which needs a real network round-trip to api.stripe.com,
 * a domain this sandbox can't reach. Neither was the actual arrival of a
 * customer.subscription.deleted event from a live Stripe account - only
 * that this code parses one correctly once it arrives. Verify both against
 * your own Stripe test account (cancel a test subscription and confirm the
 * store reverts to Free) before relying on this in production.
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  private readonly logger = new Logger('StripePaymentProvider');
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;

  constructor(config: ConfigService) {
    const secretKey = config.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe',
      );
    }
    this.stripe = new Stripe(secretKey);
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
  }

  async createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        { price: this.priceIdForPlan(params.targetPlan), quantity: 1 },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { storeId: params.storeId, targetPlan: params.targetPlan },
    });

    if (!session.url) {
      throw new BadRequestException('Stripe did not return a checkout URL');
    }
    return { url: session.url };
  }

  async handleWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<WebhookEvent | null> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      this.logger.warn(`Webhook signature verification failed: ${err}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const storeId = session.metadata?.storeId;
      const targetPlan = session.metadata?.targetPlan as Plan | undefined;
      if (!storeId || !targetPlan) {
        this.logger.warn(
          'checkout.session.completed missing storeId/targetPlan metadata',
        );
        return null;
      }
      return {
        type: 'checkout.completed',
        eventId: event.id,
        storeId,
        plan: targetPlan,
        providerCustomerId:
          typeof session.customer === 'string' ? session.customer : null,
        providerSubscriptionId:
          typeof session.subscription === 'string'
            ? session.subscription
            : null,
      };
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      return {
        type: 'subscription.ended',
        eventId: event.id,
        providerSubscriptionId: subscription.id,
      };
    }

    return null;
  }

  /**
   * Maps our internal Plan enum to a Stripe Price ID. Real Price IDs are
   * created in the Stripe dashboard (test mode) and belong in env vars, not
   * hardcoded - fill these in once you have a Stripe test account.
   */
  private priceIdForPlan(plan: Plan): string {
    const envKey = `STRIPE_PRICE_ID_${plan}`;
    const priceId = process.env[envKey];
    if (!priceId) {
      throw new BadRequestException(
        `Missing ${envKey} - set it to a Stripe test-mode Price ID`,
      );
    }
    return priceId;
  }
}
