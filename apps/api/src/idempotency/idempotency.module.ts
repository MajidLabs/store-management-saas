import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyRecord } from './idempotency-record.entity';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord])],
  providers: [{ provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor }],
  exports: [TypeOrmModule],
})
export class IdempotencyModule {}
