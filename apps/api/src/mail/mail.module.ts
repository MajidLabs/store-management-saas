import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MAIL_PROVIDER } from './mail-provider.interface';
import { MailhogMailProvider } from './mailhog-mail.provider';
import { SmtpMailProvider } from './smtp-mail.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('MAIL_TRANSPORT') === 'smtp'
          ? new SmtpMailProvider(config)
          : new MailhogMailProvider(config),
    },
  ],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
