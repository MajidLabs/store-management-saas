import { NotFoundException } from '@nestjs/common';
import { BillingService } from './billing.service';
import { Plan } from '../common/enums/plan.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';

describe('BillingService', () => {
  let subscriptions: { findOne: jest.Mock; update: jest.Mock };
  let webhookEvents: { findOne: jest.Mock; save: jest.Mock };
  let users: { count: jest.Mock };
  let paymentProvider: {
    createCheckoutSession: jest.Mock;
    handleWebhook: jest.Mock;
  };
  let service: BillingService;

  beforeEach(() => {
    subscriptions = { findOne: jest.fn(), update: jest.fn() };
    webhookEvents = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    // Defaults to 0 staff so existing tests that don't care about the
    // staff-limit check (added alongside assertStaffFitsPlan) keep passing
    // unchanged; tests for that check override this per-case.
    users = { count: jest.fn().mockResolvedValue(0) };
    paymentProvider = {
      createCheckoutSession: jest.fn(),
      handleWebhook: jest.fn(),
    };
    service = new BillingService(
      subscriptions as any,
      webhookEvents as any,
      users as any,
      paymentProvider as any,
    );
  });

  describe('getSubscription', () => {
    it('returns the subscription for the store', async () => {
      subscriptions.findOne.mockResolvedValue({
        storeId: 'store-1',
        plan: Plan.FREE,
      });
      const result = await service.getSubscription('store-1');
      expect(result.plan).toBe(Plan.FREE);
    });

    it('throws NotFoundException when no subscription exists', async () => {
      subscriptions.findOne.mockResolvedValue(null);
      await expect(service.getSubscription('store-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createCheckoutSession', () => {
    it('applies the plan immediately when the provider returns immediatePlan (mock provider behavior)', async () => {
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'http://localhost:3001/success',
        immediatePlan: Plan.PRO,
      });

      const result = await service.createCheckoutSession('store-1', {
        targetPlan: Plan.PRO,
        successUrl: 'http://localhost:3001/success',
        cancelUrl: 'http://localhost:3001/cancel',
      });

      expect(result.url).toBe('http://localhost:3001/success');
      expect(subscriptions.update).toHaveBeenCalledWith(
        { storeId: 'store-1' },
        { plan: Plan.PRO, status: SubscriptionStatus.ACTIVE },
      );
    });

    it('does NOT touch the database when the provider has no immediatePlan (real Stripe behavior - waits for webhook)', async () => {
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/session-xyz',
      });

      await service.createCheckoutSession('store-1', {
        targetPlan: Plan.PRO,
        successUrl: 'http://localhost:3001/success',
        cancelUrl: 'http://localhost:3001/cancel',
      });

      expect(subscriptions.update).not.toHaveBeenCalled();
    });

    it('blocks a downgrade that would leave the store over the target plan staff limit', async () => {
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'http://localhost:3001/success',
        immediatePlan: Plan.FREE,
      });
      users.count.mockResolvedValue(2); // FREE only allows 1

      await expect(
        service.createCheckoutSession('store-1', {
          targetPlan: Plan.FREE,
          successUrl: 'http://localhost:3001/success',
          cancelUrl: 'http://localhost:3001/cancel',
        }),
      ).rejects.toThrow(/currently has 2 staff/);

      expect(subscriptions.update).not.toHaveBeenCalled();
    });

    it('allows a downgrade when staff count already fits the target plan', async () => {
      paymentProvider.createCheckoutSession.mockResolvedValue({
        url: 'http://localhost:3001/success',
        immediatePlan: Plan.FREE,
      });
      users.count.mockResolvedValue(1); // fits FREE's limit of 1

      const result = await service.createCheckoutSession('store-1', {
        targetPlan: Plan.FREE,
        successUrl: 'http://localhost:3001/success',
        cancelUrl: 'http://localhost:3001/cancel',
      });

      expect(result.url).toBe('http://localhost:3001/success');
      expect(subscriptions.update).toHaveBeenCalledWith(
        { storeId: 'store-1' },
        { plan: Plan.FREE, status: SubscriptionStatus.ACTIVE },
      );
    });
  });

  describe('handleWebhook', () => {
    it('applies the plan change and records the event when the provider parses a checkout.completed event', async () => {
      paymentProvider.handleWebhook.mockResolvedValue({
        type: 'checkout.completed',
        eventId: 'evt_1',
        storeId: 'store-1',
        plan: Plan.PRO,
        providerCustomerId: 'cus_1',
        providerSubscriptionId: 'sub_1',
      });

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(subscriptions.update).toHaveBeenCalledWith(
        { storeId: 'store-1' },
        {
          plan: Plan.PRO,
          status: SubscriptionStatus.ACTIVE,
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
        },
      );
      expect(webhookEvents.save).toHaveBeenCalledWith({
        eventId: 'evt_1',
        provider: 'stripe',
      });
    });

    it('does nothing when the provider returns null (irrelevant event type)', async () => {
      paymentProvider.handleWebhook.mockResolvedValue(null);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(subscriptions.update).not.toHaveBeenCalled();
      expect(webhookEvents.save).not.toHaveBeenCalled();
    });

    it('skips a redelivered event instead of re-applying it (idempotency)', async () => {
      paymentProvider.handleWebhook.mockResolvedValue({
        type: 'checkout.completed',
        eventId: 'evt_1',
        storeId: 'store-1',
        plan: Plan.PRO,
        providerCustomerId: 'cus_1',
        providerSubscriptionId: 'sub_1',
      });
      webhookEvents.findOne.mockResolvedValue({
        eventId: 'evt_1',
        provider: 'stripe',
      });

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(subscriptions.update).not.toHaveBeenCalled();
      expect(webhookEvents.save).not.toHaveBeenCalled();
    });

    it('reverts the matching store to Free on subscription.ended', async () => {
      paymentProvider.handleWebhook.mockResolvedValue({
        type: 'subscription.ended',
        eventId: 'evt_2',
        providerSubscriptionId: 'sub_1',
      });
      subscriptions.findOne.mockResolvedValue({
        storeId: 'store-1',
        stripeSubscriptionId: 'sub_1',
      });

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(subscriptions.findOne).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_1' },
      });
      expect(subscriptions.update).toHaveBeenCalledWith(
        { storeId: 'store-1' },
        { plan: Plan.FREE, status: SubscriptionStatus.ACTIVE },
      );
      expect(webhookEvents.save).toHaveBeenCalledWith({
        eventId: 'evt_2',
        provider: 'stripe',
      });
    });

    it('does not touch any subscription when subscription.ended matches no known store, but still records the event', async () => {
      paymentProvider.handleWebhook.mockResolvedValue({
        type: 'subscription.ended',
        eventId: 'evt_3',
        providerSubscriptionId: 'sub_unknown',
      });
      subscriptions.findOne.mockResolvedValue(null);

      await service.handleWebhook(Buffer.from('{}'), 'sig');

      expect(subscriptions.update).not.toHaveBeenCalled();
      expect(webhookEvents.save).toHaveBeenCalledWith({
        eventId: 'evt_3',
        provider: 'stripe',
      });
    });
  });
});
