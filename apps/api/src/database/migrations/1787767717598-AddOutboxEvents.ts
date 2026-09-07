import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboxEvents1787767717598 implements MigrationInterface {
  name = 'AddOutboxEvents1787767717598';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "outbox_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_type" character varying NOT NULL, "payload" jsonb NOT NULL, "processed" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "processed_at" TIMESTAMP, CONSTRAINT "PK_outbox_events_id" PRIMARY KEY ("id"))`,
    );
    // The poller's whole query is "find unprocessed rows" - this is the
    // one index that query actually needs, and a partial index (only rows
    // where processed = false) stays small forever regardless of how many
    // processed rows accumulate, unlike an index over the full table.
    await queryRunner.query(
      `CREATE INDEX "IDX_outbox_events_unprocessed" ON "outbox_events" ("created_at") WHERE "processed" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_outbox_events_unprocessed"`);
    await queryRunner.query(`DROP TABLE "outbox_events"`);
  }
}
