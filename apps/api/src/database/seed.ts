import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { User } from '../users/entities/user.entity';
import { Store } from '../stores/entities/store.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Category } from '../categories/entities/category.entity';
import { Product } from '../products/entities/product.entity';
import { Role } from '../common/enums/role.enum';
import { Plan } from '../common/enums/plan.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';

const SALT_ROUNDS = 10;
const nodeEnv = process.env.NODE_ENV || 'development';

// SuperAdmin is a real privileged platform-management account, unlike the
// demo store owner below (which is meant to have a public, documented
// login for portfolio visitors). Refusing to seed it with a password
// that's sitting in this public repo is much better than silently doing
// so in a real deployment.
function requireInProduction(
  value: string | undefined,
  envVarName: string,
  devDefault: string,
): string {
  if (value) return value;
  if (nodeEnv === 'production') {
    throw new Error(
      `${envVarName} must be set when NODE_ENV=production - refusing to seed a SuperAdmin account with a public default password.`,
    );
  }
  return devDefault;
}

async function seedSuperAdmin() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL || 'admin@example.com';
  const password = requireInProduction(
    process.env.SEED_SUPER_ADMIN_PASSWORD,
    'SEED_SUPER_ADMIN_PASSWORD',
    'ChangeMe123!',
  );

  const repo = AppDataSource.getRepository(User);
  const existing = await repo.findOne({ where: { email } });

  if (existing) {
    console.log(`Seed: SuperAdmin ${email} already exists, skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await repo.save(
    repo.create({ email, passwordHash, role: Role.SUPER_ADMIN, storeId: null }),
  );
  console.log(
    `Seed: created SuperAdmin ${email} / ${password} (change this password).`,
  );
}

async function seedDemoStore() {
  const ownerEmail =
    process.env.SEED_DEMO_OWNER_EMAIL || 'demo-owner@example.com';
  const password = process.env.SEED_DEMO_OWNER_PASSWORD || 'DemoPass123!';

  const userRepo = AppDataSource.getRepository(User);
  const existing = await userRepo.findOne({ where: { email: ownerEmail } });
  if (existing) {
    console.log(
      `Seed: demo store owner ${ownerEmail} already exists, skipping.`,
    );
    return;
  }

  await AppDataSource.transaction(async (manager) => {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    let owner = manager.create(User, {
      email: ownerEmail,
      passwordHash,
      role: Role.STORE_OWNER,
      storeId: null,
    });
    owner = await manager.save(owner);

    const store = await manager.save(
      manager.create(Store, { name: 'Demo Corner Shop', ownerId: owner.id }),
    );
    await manager.save(
      manager.create(Subscription, {
        storeId: store.id,
        plan: Plan.FREE,
        status: SubscriptionStatus.ACTIVE,
      }),
    );
    owner.storeId = store.id;
    await manager.save(owner);

    // Required now that this script runs as the restricted app_runtime
    // role (see docs/ARCHITECTURE.md §20's RLS section) - without this,
    // the Product inserts below would be rejected by the tenant_isolation
    // policy's WITH CHECK clause, since current_setting('app.current_
    // store_id', true) returns NULL when unset, and store_id = NULL is
    // never true. SET LOCAL (via set_config's third argument) scopes this
    // to the current transaction only, matching RlsContextInterceptor's
    // own approach for real requests.
    await manager.query(`SELECT set_config('app.current_store_id', $1, true)`, [
      store.id,
    ]);

    const beverages = await manager.save(
      manager.create(Category, { storeId: store.id, name: 'Beverages' }),
    );
    const snacks = await manager.save(
      manager.create(Category, { storeId: store.id, name: 'Snacks' }),
    );

    await manager.save([
      manager.create(Product, {
        storeId: store.id,
        categoryId: beverages.id,
        name: 'Espresso Beans 1kg',
        description: 'Single-origin, medium roast.',
        price: 12.99,
        stock: 50,
      }),
      manager.create(Product, {
        storeId: store.id,
        categoryId: beverages.id,
        name: 'Green Tea 250g',
        price: 6.5,
        stock: 100,
      }),
      manager.create(Product, {
        storeId: store.id,
        categoryId: snacks.id,
        name: 'Potato Chips',
        price: 3.25,
        stock: 200,
      }),
    ]);
  });

  console.log(
    `Seed: created demo store "Demo Corner Shop" - owner ${ownerEmail} / ${password}`,
  );
}

async function seed() {
  await AppDataSource.initialize();
  await seedSuperAdmin();
  await seedDemoStore();
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
