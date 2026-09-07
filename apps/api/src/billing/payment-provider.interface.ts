import { Plan } from '../common/enums/plan.enum';

export interface CheckoutSessionParams {
  storeId: string;
  targetPlan: Plan;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  url: string;
  /** Set only by providers that complete synchronously (e.g. the mock) - BillingService applies the plan change immediately when this is present, instead of waiting for a webhook. */
  immediatePlan?: Plan;
}

export interface CheckoutCompletedEvent {
  type: 'checkout.completed';
  /** The provider's own event ID - used to detect and skip redelivered webhooks. */
  eventId: string;
  storeId: string;
  plan: Plan;
  /** Present when the provider ties a customer/subscription record to this checkout, so later lifecycle events (e.g. cancellation) can be matched back to a store without re-parsing metadata. Null for providers that don't have this concept (the mock). */
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
}

export interface SubscriptionEndedEvent {
  type: 'subscription.ended';
  eventId: string;
  /** Matched against the stored providerSubscriptionId from the CheckoutCompletedEvent above - BillingService looks up the store, the provider doesn't need DB access to know it. */
  providerSubscriptionId: string;
}

export type WebhookEvent = CheckoutCompletedEvent | SubscriptionEndedEvent;

export interface PaymentProvider {
  createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult>;
  /** Returns null for events this provider doesn't need BillingService to act on. */
  handleWebhook(
    rawBody: Buffer,
    signature: string,
  ): Promise<WebhookEvent | null>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
