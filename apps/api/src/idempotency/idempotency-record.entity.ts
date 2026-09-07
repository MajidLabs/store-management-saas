import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Caches the response to a request made with an `Idempotency-Key` header,
 * so a retried request (client timeout, a flaky connection, a double-tap on
 * "Place order") returns the exact original result instead of creating a
 * second order or a second checkout session. Key is
 * `${storeId}:${route}:${clientProvidedKey}` - storeId is included so one
 * store can't collide with (or read) another's idempotency record by
 * guessing/reusing a key string, and route is included so the same key
 * reused across two different endpoints doesn't collide either.
 */
@Entity('idempotency_records')
export class IdempotencyRecord {
  @PrimaryColumn()
  id: string;

  @Column({ name: 'status_code' })
  statusCode: number;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: unknown;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
