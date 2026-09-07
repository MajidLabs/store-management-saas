import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookEvents1786854575431 implements MigrationInterface {
  name = 'AddWebhookEvents1786854575431';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "webhook_events" ("event_id" character varying NOT NULL, "provider" character varying NOT NULL, "processed_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_webhook_events_event_id" PRIMARY KEY ("event_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "webhook_events"`);
  }
}
