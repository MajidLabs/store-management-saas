import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyRecords1786964779642 implements MigrationInterface {
  name = 'AddIdempotencyRecords1786964779642';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "idempotency_records" ("id" character varying NOT NULL, "status_code" integer NOT NULL, "response_body" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_idempotency_records_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "idempotency_records"`);
  }
}
