import 'dotenv/config';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Store } from '../stores/entities/store.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Category } from '../categories/entities/category.entity';
import { Product } from '../products/entities/product.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { WebhookEvent } from '../billing/entities/webhook-event.entity';
import { IdempotencyRecord } from '../idempotency/idempotency-record.entity';
import { OutboxEvent } from '../outbox/outbox-event.entity';
import { AuditLog } from '../audit/audit-log.entity';

/**
 * Used by the `typeorm` migration CLI, both locally (via ts-node, resolving
 * src/database/migrations/*.ts) and inside the production Docker image (running
 * compiled JS, where __dirname is dist/database and this resolves *.js instead).
 * The running application itself connects via TypeOrmModule.forRootAsync in
 * app.module.ts, which goes through Nest's ConfigService instead of this file.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
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
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
});
