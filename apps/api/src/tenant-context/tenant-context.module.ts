import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { DataSource } from 'typeorm';
import { RlsContextInterceptor } from './rls-context.interceptor';

/**
 * Makes `TransactionHost<TransactionalAdapterTypeOrm>` injectable
 * app-wide, and registers RlsContextInterceptor globally (see its own
 * comment for what it actually does and, importantly, which services'
 * queries this currently affects).
 */
@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      middleware: { mount: true },
      plugins: [
        new ClsPluginTransactional({
          adapter: new TransactionalAdapterTypeOrm({
            dataSourceToken: DataSource,
          }),
        }),
      ],
    }),
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor }],
})
export class TenantContextModule {}
