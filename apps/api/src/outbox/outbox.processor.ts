import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';
import { MailQueueService } from '../queue/mail-queue.service';
import { MailMessage } from '../mail/mail-provider.interface';

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 20;

/**
 * Polls for unprocessed outbox rows and enqueues each one's payload onto
 * the real mail queue - this is what turns "durably recorded intent to
 * notify" (OutboxService.writeSendEmail, written inside the same
 * transaction as the business event it's about) into an actual outgoing
 * email. If the process crashes after the transaction commits but before
 * this poller gets to a given row, the row is still sitting there,
 * unprocessed, in Postgres - the next poll (this instance restarting, or
 * any other instance of this API) picks it up. That's the actual guarantee
 * an outbox provides that a bare "enqueue after commit" call doesn't:
 * enqueuing right after the transaction is real, but not atomic with it -
 * a crash in that narrow window between them loses the notification
 * silently, with no record it should have happened. The row here is that
 * record.
 *
 * Deliberately a plain setInterval poller, not a BullMQ repeatable job -
 * this keeps the "read from Postgres, write to the queue" logic in one
 * place, easy to call directly and synchronously in tests (pollOnce())
 * rather than needing to wait on a scheduler.
 */
@Injectable()
export class OutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('OutboxProcessor');
  private intervalHandle: NodeJS.Timeout | undefined;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly events: Repository<OutboxEvent>,
    private readonly mailQueue: MailQueueService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.pollOnce();
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  /**
   * One pass: find unprocessed rows, enqueue each, mark it processed.
   * Public and directly callable (not just via the interval) specifically
   * so tests can trigger a poll deterministically instead of waiting up to
   * POLL_INTERVAL_MS for the timer.
   */
  async pollOnce(): Promise<number> {
    const pending = await this.events.find({
      where: { processed: false },
      order: { createdAt: 'ASC' },
      take: BATCH_SIZE,
    });

    for (const event of pending) {
      try {
        if (event.eventType === 'send-email') {
          await this.mailQueue.enqueue(event.payload as MailMessage);
        } else {
          this.logger.warn(`Unknown outbox event type: ${event.eventType}`);
        }
        await this.events.update(event.id, {
          processed: true,
          processedAt: new Date(),
        });
      } catch (err) {
        // Leave unprocessed - the next poll retries it. Enqueueing to
        // Redis is itself near-instant and rarely fails on its own, but if
        // Redis is briefly unreachable, this is exactly the case the
        // outbox exists for: the row survives, nothing is lost, and it
        // goes out once Redis is back.
        this.logger.error(
          `Failed to process outbox event ${event.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return pending.length;
  }
}
