import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Worker } from 'bullmq';
import {
  MAIL_PROVIDER,
  MailMessage,
  MailProvider,
} from '../mail/mail-provider.interface';
import { MAIL_QUEUE_NAME } from './queue.constants';

/**
 * The actual send happens here, not at the call site - AuthService/
 * OrdersService only enqueue (see MailQueueService). BullMQ retries a
 * thrown error automatically (5 attempts, exponential backoff - see
 * queue.module.ts's Queue defaultJobOptions): both MailhogMailProvider and
 * SmtpMailProvider now throw on a real send failure instead of swallowing
 * it internally (see their class comments) specifically so retry can
 * actually fire here - a transient SMTP hiccup no longer means the email
 * is silently lost forever.
 *
 * A plain service with its own bullmq Worker (via OnModuleInit /
 * OnModuleDestroy), not `@nestjs/bullmq`'s `@Processor`/`WorkerHost` - see
 * queue.module.ts's comment for why (a real pnpm peer-dependency
 * resolution issue with that package in this environment, not a design
 * preference).
 */
@Injectable()
export class MailWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('MailWorker');
  private worker: Worker | undefined;

  constructor(
    private readonly config: ConfigService,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker(
      MAIL_QUEUE_NAME,
      async (job: Job<MailMessage>) => {
        this.logger.log(
          `Sending queued email to ${job.data.to} (job ${job.id})`,
        );
        await this.mail.send(job.data);
      },
      {
        connection: {
          url: this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
        },
      },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.warn(
        `Job ${job?.id} (to ${job?.data?.to}) failed: ${err.message}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    // Awaited deliberately - closing without waiting can leave an in-flight
    // job's Redis connection torn down mid-write, the same class of "looks
    // fine, then a bare connection error shows up later" bug the
    // idempotency interceptor's fire-and-forget write already turned out
    // to be (see docs/ARCHITECTURE.md §20).
    await this.worker?.close();
  }
}
