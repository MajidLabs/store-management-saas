import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OutboxEvent } from './outbox-event.entity';
import { MailMessage } from '../mail/mail-provider.interface';

/**
 * Writes an outbox row. Always called with a transaction's EntityManager
 * (never the plain injected repository), so the write is part of whatever
 * transaction the caller is already in - see OrdersService.create() for
 * the actual usage. Calling this outside a transaction would defeat the
 * entire point: the durability guarantee only holds if this write commits
 * atomically with the business event it represents.
 */
@Injectable()
export class OutboxService {
  async writeSendEmail(
    manager: EntityManager,
    message: MailMessage,
  ): Promise<void> {
    const repo = manager.getRepository(OutboxEvent);
    await repo.save(
      repo.create({
        eventType: 'send-email',
        payload: message,
        processed: false,
      }),
    );
  }
}
