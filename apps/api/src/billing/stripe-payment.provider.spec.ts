import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Stripe = require('stripe');
import { Plan } from '../common/enums/plan.enum';
import { StripePaymentProvider } from './stripe-payment.provider';

/**
 * Uses Stripe's own `webhooks.generateTestHeaderString` to build a
 * genuinely-signed `Stripe-Signature` header (real HMAC-SHA256 over the raw
 * payload with the configured webhook secret) - the same verification code
 * path `stripe.webhooks.constructEvent` runs for a real webhook delivery.
 * No network call to api.stripe.com is involved (signing/verification is
 * pure local crypto), so this can't test createCheckoutSession (a real
 * network call) - see the class doc comment for that boundary.
 */
describe('StripePaymentProvider webhook handling', () => {
  const webhookSecret = 'whsec_test_secret';

  function makeProvider(): StripePaymentProvider {
    const config = {
      get: (key: string) =>
        ({
          STRIPE_SECRET_KEY: 'sk_test_fake',
          STRIPE_WEBHOOK_SECRET: webhookSecret,
        })[key],
    } as ConfigService;
    return new StripePaymentProvider(config);
  }

  function signedRequest(event: unknown): {
    rawBody: Buffer;
    signature: string;
  } {
    const payloadString = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: webhookSecret,
    });
    return { rawBody: Buffer.from(payloadString), signature };
  }

  it('parses a validly-signed checkout.session.completed event', async () => {
    const provider = makeProvider();
    const { rawBody, signature } = signedRequest({
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { storeId: 'store-1', targetPlan: Plan.PRO },
          customer: 'cus_abc',
          subscription: 'sub_abc',
        },
      },
    });

    const result = await provider.handleWebhook(rawBody, signature);

    expect(result).toEqual({
      type: 'checkout.completed',
      eventId: 'evt_checkout_1',
      storeId: 'store-1',
      plan: Plan.PRO,
      providerCustomerId: 'cus_abc',
      providerSubscriptionId: 'sub_abc',
    });
  });

  it('returns null when checkout.session.completed is missing storeId/targetPlan metadata, instead of throwing', async () => {
    const provider = makeProvider();
    const { rawBody, signature } = signedRequest({
      id: 'evt_checkout_2',
      type: 'checkout.session.completed',
      data: { object: { metadata: {}, customer: 'cus_abc' } },
    });

    const result = await provider.handleWebhook(rawBody, signature);

    expect(result).toBeNull();
  });

  it('parses a validly-signed customer.subscription.deleted event', async () => {
    const provider = makeProvider();
    const { rawBody, signature } = signedRequest({
      id: 'evt_sub_deleted_1',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_abc' } },
    });

    const result = await provider.handleWebhook(rawBody, signature);

    expect(result).toEqual({
      type: 'subscription.ended',
      eventId: 'evt_sub_deleted_1',
      providerSubscriptionId: 'sub_abc',
    });
  });

  it('returns null for an event type this provider does not act on', async () => {
    const provider = makeProvider();
    const { rawBody, signature } = signedRequest({
      id: 'evt_other',
      type: 'payment_intent.created',
      data: { object: {} },
    });

    const result = await provider.handleWebhook(rawBody, signature);

    expect(result).toBeNull();
  });

  it('rejects a forged signature with 400, and never gets far enough to parse the (attacker-controlled) event type', async () => {
    const provider = makeProvider();
    const payloadString = JSON.stringify({
      id: 'evt_forged',
      type: 'checkout.session.completed',
      data: {
        object: { metadata: { storeId: 'store-1', targetPlan: Plan.PRO } },
      },
    });

    await expect(
      provider.handleWebhook(
        Buffer.from(payloadString),
        't=1,v1=0000000000000000000000000000000000000000000000000000000000000000',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a request with no signature header at all', async () => {
    const provider = makeProvider();
    const payloadString = JSON.stringify({ id: 'evt_x', type: 'x' });

    await expect(
      provider.handleWebhook(Buffer.from(payloadString), ''),
    ).rejects.toThrow(BadRequestException);
  });
});
