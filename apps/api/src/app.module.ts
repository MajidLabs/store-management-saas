import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { User } from './users/entities/user.entity';
import { Store } from './stores/entities/store.entity';
import { Subscription } from './subscriptions/entities/subscription.entity';
import { Category } from './categories/entities/category.entity';
import { Product } from './products/entities/product.entity';
import { Order } from './orders/entities/order.entity';
import { OrderItem } from './orders/entities/order-item.entity';
import { WebhookEvent } from './billing/entities/webhook-event.entity';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { QueueModule } from './queue/queue.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxEvent } from './outbox/outbox-event.entity';
import { AuditModule } from './audit/audit.module';
import { AuditLog } from './audit/audit-log.entity';
import { TenantContextModule } from './tenant-context/tenant-context.module';
import { IdempotencyRecord } from './idempotency/idempotency-record.entity';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { StoresModule } from './stores/stores.module';
import { BillingModule } from './billing/billing.module';
import { AdminModule } from './admin/admin.module';
import { MailModule } from './mail/mail.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { StoreSuspensionGuard } from './common/guards/store-suspension.guard';
import { StoreSuspensionGuardModule } from './common/guards/store-suspension-guard.module';
import { CsrfGuard } from './common/guards/csrf.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get<string>('NODE_ENV') !== 'production';
        return {
          pinoHttp: {
            level: isDev ? 'debug' : 'info',
            // Pretty, colorized logs in dev; plain structured JSON in
            // production (what a real log aggregator - CloudWatch, Loki,
            // Datadog - expects to ingest).
            transport: isDev
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
            genReqId: (req: any) => req.requestId ?? randomUUID(),
            customProps: (req: any) => ({ requestId: req.requestId }),
            redact: ['req.headers.authorization', 'req.headers.cookie'],
            serializers: {
              // Trim noisy request/response objects down to what's actually
              // useful in a log line.
              req: (req: any) => ({ method: req.method, url: req.url }),
              res: (res: any) => ({ statusCode: res.statusCode }),
            },
          },
        };
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('DATABASE_URL'),
        entities: [
          User,
          Store,
          Subscription,
          Category,
          Product,
          Order,
          OrderItem,
          WebhookEvent,
          IdempotencyRecord,
          OutboxEvent,
          AuditLog,
        ],
        // Schema changes go through migrations only (src/database/migrations), never auto-sync.
        synchronize: false,
      }),
    }),
    MailModule,
    TenantContextModule,
    AuthModule,
    HealthModule,
    MetricsModule,
    IdempotencyModule,
    QueueModule,
    OutboxModule,
    AuditModule,
    CategoriesModule,
    ProductsModule,
    OrdersModule,
    StoresModule,
    BillingModule,
    AdminModule,
    StoreSuspensionGuardModule,
  ],
  providers: [
    // Order matters: JwtAuthGuard runs first and populates request.user,
    // CsrfGuard runs second (cheap cookie/header comparison, no DB work,
    // so it's better to reject a forged mutating request before the
    // guards below do any DB lookups), RolesGuard runs third and reads
    // request.user, StoreSuspensionGuard runs fourth (needs a DB lookup so
    // it's near-last), ThrottlerGuard runs last since it doesn't depend on
    // any of the others.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useExisting: StoreSuspensionGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Must run before pino-http's own middleware (registered internally by
    // LoggerModule) so genReqId above can see req.requestId already set.
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
