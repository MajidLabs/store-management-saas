import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Extends Postgres Row-Level Security to `categories` and `orders`, the
 * same pattern §20 established for `products` (see
 * EnableRlsOnProducts1787827796841 and docs/ARCHITECTURE.md §20's RLS
 * section for the full explanation of the two-policy-clause / FORCE RLS /
 * non-superuser app_runtime role reasoning - not repeated here).
 *
 * This migration alone does not make RLS effective on either table: each
 * one also needed a matching application-side change so the service
 * actually reads through the transaction the session variable is set on,
 * not a plain injected repository (see CategoriesService/OrdersService -
 * both switched to the same txHost.tx.getRepository() pattern
 * ProductsService already used). Without that half, both tables would
 * silently return zero rows for every query once FORCE RLS is on, not an
 * error - worth stating plainly since that failure mode looks nothing
 * like a permissions error.
 *
 * `order_items` deliberately has no policy of its own: it has no
 * `store_id` column to check (it's scoped through its parent `orders`
 * row), and every access to it in this codebase already goes through
 * `orders`/`OrdersService` first - see docs/ARCHITECTURE.md §20 (RLS
 * section addendum) for why a child table with no tenant column of its
 * own doesn't need - and can't correctly have - its own tenant_isolation
 * policy the same shape as its parent's.
 */
export class EnableRlsOnOrdersAndCategories1789022503429 implements MigrationInterface {
  name = 'EnableRlsOnOrdersAndCategories1789022503429';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `CREATE POLICY "tenant_isolation" ON "categories"
        USING (store_id = current_setting('app.current_store_id', true)::uuid)
        WITH CHECK (store_id = current_setting('app.current_store_id', true)::uuid)`,
    );

    await queryRunner.query(`ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "orders" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(
      `CREATE POLICY "tenant_isolation" ON "orders"
        USING (store_id = current_setting('app.current_store_id', true)::uuid)
        WITH CHECK (store_id = current_setting('app.current_store_id', true)::uuid)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP POLICY "tenant_isolation" ON "orders"`);
    await queryRunner.query(`ALTER TABLE "orders" NO FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY`);

    await queryRunner.query(`DROP POLICY "tenant_isolation" ON "categories"`);
    await queryRunner.query(
      `ALTER TABLE "categories" NO FORCE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DISABLE ROW LEVEL SECURITY`,
    );
  }
}
