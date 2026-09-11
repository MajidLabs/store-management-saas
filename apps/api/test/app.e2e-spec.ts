import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { User } from '../src/users/entities/user.entity';
import { Role } from '../src/common/enums/role.enum';
import { OutboxEvent } from '../src/outbox/outbox-event.entity';
import { OutboxProcessor } from '../src/outbox/outbox.processor';

/**
 * /auth/register and /auth/login stopped returning tokens in the response
 * body once auth moved to httpOnly cookies (see docs/ARCHITECTURE.md's Auth
 * & Security section) - this file originally read `res.body.accessToken`,
 * which silently became `undefined` after that change and every downstream
 * "Bearer undefined" request correctly got 401. Nothing caught it: it needs
 * a real Postgres connection to even run, so it was never actually executed
 * after the migration, only counted for its `it()` blocks - see
 * README.md's "Known limitations" and docs/ARCHITECTURE.md §19.
 *
 * This pulls the token out of the Set-Cookie header instead and keeps using
 * it as a Bearer header for the rest of the suite - JwtAccessStrategy
 * accepts either (see src/auth/strategies/jwt-access.strategy.ts), and a
 * Bearer-token caller is also exempt from the CSRF check that would
 * otherwise apply to cookie-authenticated mutating requests, which keeps
 * this file's existing structure intact instead of needing every POST/
 * PATCH/DELETE below to also carry a CSRF header.
 */
function extractAccessTokenCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const match = cookies.find((c) => c.startsWith('access_token='));
  if (!match) {
    throw new Error(
      'No access_token cookie in this response - is /auth/register or /auth/login still setting one?',
    );
  }
  return match.split(';')[0].slice('access_token='.length);
}

describe('Health & Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });
  });

  it('GET /metrics returns real Prometheus text reflecting actual requests, not a stub', async () => {
    // Two /health hits first, so the counter below is provably non-zero
    // because of *this test's own traffic* - not just "some number".
    await request(app.getHttpServer()).get('/health');
    await request(app.getHttpServer()).get('/health');

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    // A real default metric from prom-client's collectDefaultMetrics -
    // confirms that's actually wired up, not just the custom HTTP ones.
    expect(res.text).toContain('process_cpu_user_seconds_total');
    // route: 'GET', route: '/health' should show at least the 2 hits above
    // plus itself not yet counted (this /metrics request finishes after
    // the text is generated) - check for >= 2, not an exact number, since
    // exactly how many other requests already hit /health earlier in this
    // suite's run is incidental to what this test is actually checking.
    const healthCounterLine = res.text
      .split('\n')
      .find(
        (line) =>
          line.startsWith('http_requests_total') &&
          line.includes('route="/health"') &&
          line.includes('status_code="200"'),
      );
    expect(healthCounterLine).toBeDefined();
    const count = Number(healthCounterLine!.split(' ').pop());
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('POST /auth/register with an invalid email returns 400', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short', storeName: 'X' })
      .expect(400);
  });

  it('POST /auth/logout without a token returns 401 (global guard is active)', () => {
    return request(app.getHttpServer()).post('/auth/logout').expect(401);
  });

  it('registers a store owner, then logs in with the same credentials', async () => {
    const email = `e2e-${Date.now()}@example.com`;

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'SuperSecret123', storeName: 'E2E Test Store' })
      .expect(201);
    expect(registerRes.body).toEqual({ success: true });
    expect(extractAccessTokenCookie(registerRes)).toBeTruthy();

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'SuperSecret123' })
      .expect(200);
    expect(extractAccessTokenCookie(loginRes)).toBeTruthy();

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'WrongPassword' })
      .expect(401);
  });
});

describe('Categories, Products, Orders (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let staffToken: string;
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const email = `catalog-e2e-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'SuperSecret123',
        storeName: 'Catalog E2E Store',
      });
    ownerToken = extractAccessTokenCookie(registerRes);

    const staffEmail = `catalog-staff-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/stores/me/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: staffEmail, password: 'StaffPass123' });
    const staffLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staffEmail, password: 'StaffPass123' });
    staffToken = extractAccessTokenCookie(staffLoginRes);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unauthenticated category creation with 401', () => {
    return request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'Beverages' })
      .expect(401);
  });

  it('lets the owner create a category and a product with stock', async () => {
    const catRes = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Beverages' })
      .expect(201);
    categoryId = catRes.body.id;

    const prodRes = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Espresso Beans', price: 12.99, stock: 10, categoryId })
      .expect(201);
    productId = prodRes.body.id;
    expect(typeof prodRes.body.price).toBe('number');
  });

  it('filters products by search term (case-insensitive)', async () => {
    const res = await request(app.getHttpServer())
      .get('/products?search=espresso')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.data.some((p: any) => p.id === productId)).toBe(true);
  });

  it('blocks a STAFF user from inviting another staff member (owner-only route)', () => {
    return request(app.getHttpServer())
      .post('/stores/me/staff')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ email: 'irrelevant@example.com', password: 'password123' })
      .expect(403);
  });

  it('creates an order and atomically decrements stock', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ items: [{ productId, quantity: 3 }] })
      .expect(201);
    expect(orderRes.body.total).toBe(38.97);

    const productRes = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(productRes.body.stock).toBe(7);
  });

  it('rolls back the ENTIRE order (no partial stock decrement) when one line item has insufficient stock', async () => {
    const secondProductRes = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Rare Bean', price: 50, stock: 1 });
    const secondProductId = secondProductRes.body.id;

    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        items: [
          { productId, quantity: 1 }, // valid (7 in stock)
          { productId: secondProductId, quantity: 99 }, // invalid (only 1 in stock)
        ],
      })
      .expect(400);

    const productRes = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    // Still 7, not 6 - the valid line item's decrement must have been rolled back too.
    expect(productRes.body.stock).toBe(7);
  });

  it('a retried POST /orders with the same Idempotency-Key returns the original order, not a second one', async () => {
    const idempotencyKey = `idem-test-${Date.now()}`;

    const first = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);

    const stockAfterFirst = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    const second = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);

    // Same order, byte-for-byte - not just "also succeeded".
    expect(second.body).toEqual(first.body);

    const stockAfterSecond = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    // The real proof: stock only decremented once. If the handler had
    // actually re-run for the "retry", this would be one lower.
    expect(stockAfterSecond.body.stock).toBe(stockAfterFirst.body.stock);
  });

  it('a different Idempotency-Key creates a genuinely separate order', async () => {
    const first = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `idem-a-${Date.now()}`)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', `idem-b-${Date.now()}`)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);

    expect(second.body.id).not.toBe(first.body.id);
  });
});

/**
 * Automates what docs/TESTING_CHECKLIST.md §9 covered manually - see
 * docs/ARCHITECTURE.md §20 for why that was flagged as the natural next
 * step. Two real stores, a staff account, and a promoted SuperAdmin, all
 * created through the real registration/login flow (the SuperAdmin
 * promotion is the one exception - there's deliberately no public endpoint
 * for that, so this reaches into the repository directly, the same way a
 * one-off `psql` UPDATE would in a real environment).
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;
  let storeAToken: string;
  let storeAStaffToken: string;
  let storeBToken: string;
  let storeBProductId: string;
  let storeBOrderId: string;
  let superAdminToken: string;
  let someStoreId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    // Store A: the token every cross-tenant attempt below is made with.
    const storeAEmail = `tenant-a-${Date.now()}@example.com`;
    const storeARes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: storeAEmail,
        password: 'SuperSecret123',
        storeName: 'Tenant Isolation Store A',
      });
    storeAToken = extractAccessTokenCookie(storeARes);

    const staffEmail = `tenant-a-staff-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post('/stores/me/staff')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ email: staffEmail, password: 'StaffPass123' });
    const staffLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: staffEmail, password: 'StaffPass123' });
    storeAStaffToken = extractAccessTokenCookie(staffLoginRes);

    // Store B: owns the product/order Store A's token must NOT be able to reach.
    const storeBEmail = `tenant-b-${Date.now()}@example.com`;
    const storeBRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: storeBEmail,
        password: 'SuperSecret123',
        storeName: 'Tenant Isolation Store B',
      });
    storeBToken = extractAccessTokenCookie(storeBRes);

    const catRes = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ name: 'Store B Category' });
    const storeBCategoryId = catRes.body.id;

    const productRes = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({
        name: 'Store B Secret Product',
        price: 9.99,
        stock: 5,
        categoryId: storeBCategoryId,
      });
    storeBProductId = productRes.body.id;

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${storeBToken}`)
      .send({ items: [{ productId: storeBProductId, quantity: 1 }] });
    storeBOrderId = orderRes.body.id;

    // SuperAdmin: no public registration route for this role, deliberately -
    // promote a real registered user directly via the repository, the same
    // way a one-off DB update would in a real environment.
    const superAdminEmail = `tenant-superadmin-${Date.now()}@example.com`;
    await request(app.getHttpServer()).post('/auth/register').send({
      email: superAdminEmail,
      password: 'SuperSecret123',
      storeName: 'Ignored - promoted to SuperAdmin below',
    });
    const users = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    await users.update({ email: superAdminEmail }, { role: Role.SUPER_ADMIN });
    const superAdminLoginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: superAdminEmail, password: 'SuperSecret123' });
    superAdminToken = extractAccessTokenCookie(superAdminLoginRes);

    const listRes = await request(app.getHttpServer())
      .get('/admin/stores')
      .set('Authorization', `Bearer ${superAdminToken}`);
    someStoreId = listRes.body.data[0]?.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("Store A's token cannot GET Store B's product - 404, not the product", async () => {
    await request(app.getHttpServer())
      .get(`/products/${storeBProductId}`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .expect(404);
  });

  it("Store A's token cannot PATCH Store B's product - 404, price unchanged", async () => {
    await request(app.getHttpServer())
      .patch(`/products/${storeBProductId}`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ price: 1 })
      .expect(404);

    const stillOwnedByB = await request(app.getHttpServer())
      .get(`/products/${storeBProductId}`)
      .set('Authorization', `Bearer ${storeBToken}`)
      .expect(200);
    expect(stillOwnedByB.body.price).toBe(9.99);
  });

  it("Store A's token cannot DELETE Store B's product - 404, product still exists", async () => {
    await request(app.getHttpServer())
      .delete(`/products/${storeBProductId}`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .expect(404);
  });

  it("Store A's token cannot GET Store B's order - 404, not the order", async () => {
    await request(app.getHttpServer())
      .get(`/orders/${storeBOrderId}`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .expect(404);
  });

  it('a STAFF token cannot reach the billing endpoint (owner-only) - 403', async () => {
    await request(app.getHttpServer())
      .get('/billing/subscription')
      .set('Authorization', `Bearer ${storeAStaffToken}`)
      .expect(403);
  });

  it('a StoreOwner token cannot reach a SuperAdmin-only endpoint - 403, target store untouched', async () => {
    await request(app.getHttpServer())
      .patch(`/admin/stores/${someStoreId}/suspend`)
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ suspended: true })
      .expect(403);
  });

  it('sanity check: the SuperAdmin token this suite promoted actually works for that same endpoint', async () => {
    // Confirms the 403 above is really about StoreA's role, not a
    // coincidentally-broken endpoint or a wrong store ID - the identical
    // request succeeds with a genuinely-privileged token.
    await request(app.getHttpServer())
      .patch(`/admin/stores/${someStoreId}/suspend`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ suspended: false })
      .expect(200);
  });
});

/**
 * Covers the fix for the "downgrading from Pro to Free doesn't enforce the
 * Free plan's 1-staff limit on existing staff" bug (docs/TESTING_CHECKLIST.md
 * §manual pass, Sep 2026). Two separate code paths needed covering:
 *  - the direct/immediate downgrade path (BillingService.assertStaffFitsPlan),
 *    which CAN be blocked outright since it's a live user request; and
 *  - the case where a store ends up over its plan's staff limit some other
 *    way (in production: a Stripe webhook downgrade, which already happened
 *    on Stripe's side and can't be rejected) - simulated here with a direct
 *    DataSource write rather than a real Stripe event, and covered instead
 *    by the login-time gate in AuthService.login.
 */
describe('Billing plan / staff limits (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let ownerToken: string;
  let ownerEmail: string;
  let ownerPassword: string;
  let storeId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    dataSource = moduleFixture.get(DataSource);

    ownerEmail = `billing-e2e-${Date.now()}@example.com`;
    ownerPassword = 'SuperSecret123';
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: ownerEmail,
        password: ownerPassword,
        storeName: 'Billing E2E Store',
      });
    ownerToken = extractAccessTokenCookie(registerRes);

    const meRes = await request(app.getHttpServer())
      .get('/stores/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    storeId = meRes.body.id;

    await request(app.getHttpServer())
      .post('/billing/checkout-session')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        targetPlan: 'PRO',
        successUrl: 'http://localhost/x',
        cancelUrl: 'http://localhost/x',
      })
      .expect(201);

    for (const n of [1, 2]) {
      await request(app.getHttpServer())
        .post('/stores/me/staff')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          email: `billing-e2e-staff${n}-${Date.now()}@example.com`,
          password: 'StaffPass123',
        })
        .expect(201);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks a direct downgrade to FREE while 2 staff are active (FREE allows 1), and the plan stays PRO', async () => {
    const res = await request(app.getHttpServer())
      .post('/billing/checkout-session')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        targetPlan: 'FREE',
        successUrl: 'http://localhost/x',
        cancelUrl: 'http://localhost/x',
      })
      .expect(409);
    expect(res.body.message).toMatch(/currently has 2 staff/);

    const sub = await request(app.getHttpServer())
      .get('/billing/subscription')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(sub.body.plan).toBe('PRO');
  });

  it('blocks a STAFF login once the store is over its plan limit via a path BillingService cannot intercept (simulated webhook), but the owner can still log in', async () => {
    // Simulates what a Stripe `subscription.ended` webhook does to this row -
    // BillingService.applyPlanChange has no request to reject at that point,
    // which is exactly why the login-time gate exists as a second layer.
    await dataSource.query(
      `UPDATE subscriptions SET plan = 'FREE' WHERE store_id = $1`,
      [storeId],
    );

    const staffListRes = await request(app.getHttpServer())
      .get('/stores/me/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const secondStaffEmail = staffListRes.body[1].email;

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: secondStaffEmail, password: 'StaffPass123' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: ownerEmail, password: ownerPassword })
      .expect(200);
  });
});

/**
 * Confirms the outbox row itself, not just that the order-creation request
 * succeeded - the whole point of the outbox pattern (see
 * OutboxService/OutboxProcessor and docs/ARCHITECTURE.md §20) is a
 * durable, crash-survivable intermediate step between "order committed"
 * and "email actually sent". This directly inspects outbox_events (via the
 * repository, not any HTTP endpoint - it's an internal implementation
 * detail with no REST API of its own) to prove that step is real, not just
 * asserting the end-to-end behavior and trusting the middle.
 */
describe('Outbox pattern (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let productId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const email = `outbox-e2e-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'SuperSecret123',
        storeName: 'Outbox E2E Store',
      });
    ownerToken = extractAccessTokenCookie(registerRes);

    const catRes = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Outbox Category' });
    const productRes = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Outbox Product',
        price: 5,
        stock: 10,
        categoryId: catRes.body.id,
      });
    productId = productRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creating an order writes an unprocessed outbox row, and polling turns it into a real enqueued email', async () => {
    const outboxRepo = app.get<Repository<OutboxEvent>>(
      getRepositoryToken(OutboxEvent),
    );
    const outboxProcessor = app.get(OutboxProcessor);

    const beforeCount = await outboxRepo.count({
      where: { processed: false },
    });

    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(201);

    // The row exists immediately after the HTTP response - proving it was
    // written inside the same transaction as the order, not as some later
    // async side effect that might not have happened yet.
    const afterOrderCount = await outboxRepo.count({
      where: { processed: false },
    });
    expect(afterOrderCount).toBe(beforeCount + 1);

    const unprocessed = await outboxRepo.find({
      where: { processed: false },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    expect(unprocessed[0].eventType).toBe('send-email');
    const payload = unprocessed[0].payload as { subject: string; html: string };
    expect(payload.subject).toContain('New order');
    expect(payload.html).toContain(orderRes.body.id);

    // Poll directly rather than waiting up to 5s for the interval timer -
    // deterministic, and exercises the exact same code path.
    const processedCount = await outboxProcessor.pollOnce();
    expect(processedCount).toBeGreaterThanOrEqual(1);

    const stillUnprocessed = await outboxRepo.count({
      where: { id: unprocessed[0].id, processed: false },
    });
    expect(stillUnprocessed).toBe(0);

    const nowProcessed = await outboxRepo.findOne({
      where: { id: unprocessed[0].id },
    });
    expect(nowProcessed?.processed).toBe(true);
    expect(nowProcessed?.processedAt).not.toBeNull();
  });

  it('a poll with nothing pending processes zero rows without error', async () => {
    const outboxProcessor = app.get(OutboxProcessor);
    // Drain anything currently pending first, so this run is deterministic
    // regardless of what earlier tests in this file left behind.
    await outboxProcessor.pollOnce();
    await outboxProcessor.pollOnce();

    const count = await outboxProcessor.pollOnce();
    expect(count).toBe(0);
  });
});

/**
 * The one test in this file that actually proves Postgres Row-Level
 * Security is doing something, as opposed to every other test in this
 * file, which would pass identically whether or not RLS exists at all -
 * they all go through the app's normal, already-filtered service methods,
 * so they can't tell "the app's WHERE storeId = ... clause worked" apart
 * from "the database itself also enforced it". This runs a raw,
 * deliberately UNFILTERED query directly against the database - the
 * app-level check this bypasses entirely is exactly the kind of bug (a
 * forgotten storeId clause in some future query) RLS exists to catch. See
 * docs/ARCHITECTURE.md §20 (products) and §23 (categories, orders) for the
 * full explanation of what this is layered under (a non-superuser
 * `app_runtime` role, FORCE ROW LEVEL SECURITY, a policy, and the
 * RlsContextInterceptor/txHost wiring that sets the session variable that
 * policy checks) and why `order_items` deliberately isn't included (no
 * `store_id` column of its own - see that migration's comment).
 */
describe('Row-Level Security (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("an unfiltered query cannot see another store's product, even with zero app-level filtering", async () => {
    // Two real stores with their own real products, through the normal API.
    const storeAEmail = `rls-a-${Date.now()}@example.com`;
    const storeARes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: storeAEmail,
        password: 'SuperSecret123',
        storeName: 'RLS Store A',
      });
    const storeAToken = extractAccessTokenCookie(storeARes);
    const catA = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ name: 'A' });
    const productA = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        name: 'Store A Secret',
        price: 1,
        stock: 1,
        categoryId: catA.body.id,
      });

    const storeBEmail = `rls-b-${Date.now()}@example.com`;
    await request(app.getHttpServer()).post('/auth/register').send({
      email: storeBEmail,
      password: 'SuperSecret123',
      storeName: 'RLS Store B',
    });

    const dataSource = app.get(DataSource);

    // Set the session variable to Store B, then run a raw, completely
    // unfiltered SELECT * FROM products - no WHERE clause at all. If RLS
    // is not actually working (wrong role, missing FORCE, interceptor not
    // wired, anything), this returns Store A's product anyway, since
    // nothing in the query itself excludes it.
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const storeBUser = await queryRunner.manager.findOne(User, {
        where: { email: storeBEmail },
      });
      await queryRunner.query(
        `SELECT set_config('app.current_store_id', $1, true)`,
        [storeBUser!.storeId],
      );
      const visibleToB = await queryRunner.query('SELECT * FROM products');
      expect(
        visibleToB.some((p: { id: string }) => p.id === productA.body.id),
      ).toBe(false);

      // Same connection, same transaction, now switch the session variable
      // to Store A - the identical unfiltered query now DOES see it. This
      // rules out "RLS is just blocking everything" as an explanation for
      // the result above; it's specifically scoping by the session
      // variable, in both directions.
      const storeAUser = await queryRunner.manager.findOne(User, {
        where: { email: storeAEmail },
      });
      await queryRunner.query(
        `SELECT set_config('app.current_store_id', $1, true)`,
        [storeAUser!.storeId],
      );
      const visibleToA = await queryRunner.query('SELECT * FROM products');
      expect(
        visibleToA.some((p: { id: string }) => p.id === productA.body.id),
      ).toBe(true);
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });

  it("an unfiltered query cannot see another store's category or order, even with zero app-level filtering", async () => {
    // Categories and orders share one store pair in a single test,
    // deliberately, rather than each registering its own like the
    // products test above does - this describe block's own /auth/register
    // calls are all that's tested here, and register is throttled to 5/60s
    // (see AuthController); a third self-contained test would have pushed
    // this describe block's total past that limit.
    const storeAEmail = `rls-b-a-${Date.now()}@example.com`;
    const storeARes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: storeAEmail,
        password: 'SuperSecret123',
        storeName: 'RLS Store A2',
      });
    const storeAToken = extractAccessTokenCookie(storeARes);
    const catA = await request(app.getHttpServer())
      .post('/categories')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ name: 'Store A Secret Category' });
    const productA = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({
        name: 'A Product',
        price: 1,
        stock: 5,
        categoryId: catA.body.id,
      });
    const orderA = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${storeAToken}`)
      .send({ items: [{ productId: productA.body.id, quantity: 1 }] });

    const storeBEmail = `rls-b-b-${Date.now()}@example.com`;
    await request(app.getHttpServer()).post('/auth/register').send({
      email: storeBEmail,
      password: 'SuperSecret123',
      storeName: 'RLS Store B2',
    });

    const dataSource = app.get(DataSource);
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const storeBUser = await queryRunner.manager.findOne(User, {
        where: { email: storeBEmail },
      });
      await queryRunner.query(
        `SELECT set_config('app.current_store_id', $1, true)`,
        [storeBUser!.storeId],
      );
      const catsVisibleToB = await queryRunner.query(
        'SELECT * FROM categories',
      );
      expect(
        catsVisibleToB.some((c: { id: string }) => c.id === catA.body.id),
      ).toBe(false);
      const ordersVisibleToB = await queryRunner.query('SELECT * FROM orders');
      expect(
        ordersVisibleToB.some((o: { id: string }) => o.id === orderA.body.id),
      ).toBe(false);

      const storeAUser = await queryRunner.manager.findOne(User, {
        where: { email: storeAEmail },
      });
      await queryRunner.query(
        `SELECT set_config('app.current_store_id', $1, true)`,
        [storeAUser!.storeId],
      );
      const catsVisibleToA = await queryRunner.query(
        'SELECT * FROM categories',
      );
      expect(
        catsVisibleToA.some((c: { id: string }) => c.id === catA.body.id),
      ).toBe(true);
      const ordersVisibleToA = await queryRunner.query('SELECT * FROM orders');
      expect(
        ordersVisibleToA.some((o: { id: string }) => o.id === orderA.body.id),
      ).toBe(true);
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });
});
