import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogs1787803945937 implements MigrationInterface {
  name = 'AddAuditLogs1787803945937';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_user_id" character varying NOT NULL, "actor_email" character varying NOT NULL, "actor_role" character varying NOT NULL, "store_id" character varying, "action" character varying NOT NULL, "target_id" character varying, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_audit_logs_id" PRIMARY KEY ("id"))`,
    );
    // The read endpoint's whole query is "this store, newest first" - a
    // composite index matching that exactly, rather than two single-column
    // indexes Postgres would have to combine.
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_store_created" ON "audit_logs" ("store_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_store_created"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
  }
}
