import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enables Postgres Row-Level Security on `products`, scoped to one table
 * deliberately (see docs/ARCHITECTURE.md §20 for why this isn't on every
 * tenant-scoped table yet - it needs a matching application-side change
 * per table, not just this migration, to actually take effect).
 *
 * Two policies, not one: a table with RLS enabled and zero policies
 * defined denies ALL access by default (fails safe) - that's correct for
 * every role except one: the app's own DB user still needs to run
 * migrations, seed data, and anything else that isn't scoped to a single
 * store. `FORCE ROW LEVEL SECURITY` applies the policy even to the table
 * owner (normally exempt by default) - needed here because this project's
 * migrations and the app's runtime queries use the same role (see
 * apps/api/Dockerfile's CMD), so without FORCE, that role being the table
 * owner would silently bypass its own policy the same way a superuser
 * does. This alone doesn't make RLS effective on its own, though: a
 * Postgres *superuser* bypasses RLS unconditionally, FORCE or not - see
 * docs/DEPLOYMENT.md and docker-compose.yml for the separate,
 * non-superuser `app_runtime` role this project's DATABASE_URL actually
 * needs to use for this to mean anything at runtime.
 */
export class EnableRlsOnProducts1787827796841 implements MigrationInterface {
  name = 'EnableRlsOnProducts1787827796841';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "products" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `CREATE POLICY "tenant_isolation" ON "products"
        USING (store_id = current_setting('app.current_store_id', true)::uuid)
        WITH CHECK (store_id = current_setting('app.current_store_id', true)::uuid)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY "tenant_isolation" ON "products"`);
    await queryRunner.query(
      `ALTER TABLE "products" NO FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DISABLE ROW LEVEL SECURITY`,
    );
  }
}
