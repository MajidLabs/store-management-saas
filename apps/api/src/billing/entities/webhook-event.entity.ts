import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Records every payment-provider webhook event ID that's been successfully
 * processed, so a redelivered webhook (Stripe retries on anything but a 2xx,
 * and can also just send the same event twice - see Stripe's own docs on
 * this) is recognized and skipped rather than re-applied. The primary key is
 * the provider's own event ID, not a generated UUID - existence *is* the
 * idempotency check, no separate unique index needed.
 */
@Entity('webhook_events')
export class WebhookEvent {
  @PrimaryColumn({ name: 'event_id' })
  eventId: string;

  @Column()
  provider: string;

  @CreateDateColumn({ name: 'processed_at' })
  processedAt: Date;
}
