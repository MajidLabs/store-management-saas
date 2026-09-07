import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { MailModule } from '../mail/mail.module';
import { MailWorkerService } from './mail-worker.service';
import { MailQueueService } from './mail-queue.service';
import { MAIL_QUEUE, MAIL_QUEUE_NAME } from './queue.constants';

/**
 * Moves email sending off the request path and gives it real retry/backoff
 * instead of the previous "log and give up forever" behavior on failure
 * (see MailhogMailProvider/SmtpMailProvider's own class comments) - a
 * request that triggers an email (register, password reset, a new order)
 * now returns as soon as the job is *enqueued*, not once the email is
 * actually sent.
 *
 * Uses `bullmq` directly, not the `@nestjs/bullmq` wrapper. That switch
 * happened chasing what turned out to be a misdiagnosed bug, worth stating
 * plainly rather than leaving the wrong explanation in place: the actual
 * cause of "Nest can't resolve dependencies of MailQueueService" was a
 * circular *file* import - this module imported MailQueueService from
 * `./mail-queue.service`, which imported the MAIL_QUEUE token back from
 * this file, so whichever loaded first got a not-yet-initialized `MAIL_
 * QUEUE` (undefined) at decorator-evaluation time. `@nestjs/bullmq` was
 * never actually the problem; abandoning it wasn't necessary to fix this,
 * and pnpm's duplicate-resolved-copy theory (see the removed comment this
 * replaces) was a wrong diagnosis reached without actually isolating the
 * cause first. The fix that mattered is queue.constants.ts, splitting the
 * token constants into their own file so nothing needs to import them back
 * from a file that's simultaneously importing a class *from* it. Staying
 * on raw bullmq now is a "no need to redo working code" choice, not a
 * correction of a real @nestjs/bullmq flaw - @nestjs/bullmq would work
 * fine here with the same constants-file fix applied.
 *
 * REDIS_URL defaults to localhost:6379 (docker-compose points this at the
 * redis service) - there's no "queue disabled" mode; Redis is now a real
 * runtime dependency once this module is imported, the same way Postgres
 * already is.
 *
 * Only MailQueueService is exported - nothing outside this module needs
 * the raw Queue instance directly; AuthService/OrdersService/
 * OutboxProcessor all go through MailQueueService.
 */
@Global()
@Module({
  imports: [MailModule],
  providers: [
    {
      provide: MAIL_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Queue(MAIL_QUEUE_NAME, {
          connection: {
            url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
          },
          defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'exponential', delay: 5_000 },
            // Keep a short history for debugging without letting Redis
            // grow unbounded - this is a queue, not a permanent audit log
            // (see AuditModule for the thing that actually needs to be
            // permanent).
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 500 },
          },
        }),
    },
    MailQueueService,
    MailWorkerService,
  ],
  exports: [MailQueueService],
})
export class QueueModule {}
