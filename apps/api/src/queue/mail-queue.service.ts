import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { MailMessage } from '../mail/mail-provider.interface';
import { MAIL_QUEUE } from './queue.constants';

/**
 * What AuthService/OrdersService/OutboxProcessor actually call instead of
 * injecting MAIL_PROVIDER directly - enqueues a job and returns as soon as
 * Redis has accepted it, not once the email is actually sent.
 * MailWorkerService is what does the real sending, with BullMQ's
 * retry/backoff handling transient failures automatically.
 *
 * Closes the injected Queue on module shutdown - this is the only holder
 * of that reference, so if this doesn't close it, nothing does, leaving a
 * dangling open Redis connection. That's exactly what caused the e2e suite
 * to hang past its timeout the first time this queue work was tested,
 * rather than failing cleanly - see docs/ARCHITECTURE.md §20.
 */
@Injectable()
export class MailQueueService implements OnModuleDestroy {
  constructor(@Inject(MAIL_QUEUE) private readonly queue: Queue) {}

  async enqueue(message: MailMessage): Promise<void> {
    await this.queue.add('send', message);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
