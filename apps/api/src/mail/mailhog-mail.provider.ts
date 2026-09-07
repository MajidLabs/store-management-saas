import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailMessage, MailProvider } from './mail-provider.interface';

/**
 * Throws on failure rather than swallowing it - this used to catch and log
 * internally, on the reasoning that a dev SMTP catcher being unreachable
 * shouldn't fail the request (registration, password reset) that triggered
 * the notification. That reasoning doesn't hold anymore: sending now
 * happens in MailProcessor, a BullMQ worker, not inline with the HTTP
 * request (see docs/ARCHITECTURE.md §20's queue section) - the request is
 * already protected by construction, since MailQueueService.enqueue()
 * only adds a job, never calls send() directly. Swallowing the error here
 * instead would mean BullMQ's retry/backoff could never actually trigger
 * on a real send failure, silently defeating the entire point of routing
 * this through a queue.
 */
@Injectable()
export class MailhogMailProvider implements MailProvider {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'localhost',
      port: config.get<number>('SMTP_PORT') ?? 1025,
      secure: false,
      ignoreTLS: true,
    });
    this.from = config.get<string>('MAIL_FROM') ?? 'no-reply@store-saas.local';
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
  }
}
