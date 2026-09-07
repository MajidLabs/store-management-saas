import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CheckoutSessionParams,
  CheckoutSessionResult,
  PaymentProvider,
  WebhookEvent,
} from './payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  async createCheckoutSession(
    params: CheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    return {
      url: `${params.successUrl}?mock_session=${randomUUID()}&plan=${params.targetPlan}`,
      immediatePlan: params.targetPlan,
    };
  }

  async handleWebhook(): Promise<WebhookEvent | null> {
    // The mock provider never calls back asynchronously - upgrades happen
    // immediately in createCheckoutSession. Nothing for a webhook to do.
    return null;
  }
}
