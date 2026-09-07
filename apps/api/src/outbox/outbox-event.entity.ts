import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * The durable half of the outbox pattern: written inside the SAME
 * transaction as whatever business event it represents (see
 * OrdersService.create), so "the order was created" and "there's a
 * durable record that a notification about it needs to go out" either
 * both happen or neither does - never one without the other, even if the
 * process crashes between committing the order and calling anything else.
 *
 * `payload` is the fully-formed MailMessage (to/subject/html) already
 * resolved at write time (store name, owner email looked up inside the
 * same transaction) - OutboxProcessor doesn't re-derive anything or run
 * any business logic, it just enqueues `payload` as-is once `processed` is
 * false. That keeps the processor generic across whatever future event
 * types get written here, not order-specific.
 */
@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_type' })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: unknown;

  @Column({ default: false })
  processed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date | null;
}
