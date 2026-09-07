import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import {
  InjectTransactionHost,
  TransactionHost,
} from '@nestjs-cls/transactional';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { Request } from 'express';
import { Observable, from, lastValueFrom } from 'rxjs';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

/**
 * The second half of RLS (see the migration that enables it on `products`
 * - the actual database policy is the first half). A policy alone does
 * nothing without something telling Postgres which store the current
 * query is allowed to see - that's `app.current_store_id`, a
 * session-scoped setting the policy checks via
 * `current_setting('app.current_store_id', true)`.
 *
 * Set via `set_config(..., true)` (the `true` is the "is_local" flag,
 * equivalent to `SET LOCAL`) inside an actual transaction - this matters a
 * lot with a pooled connection: `SET LOCAL` automatically resets at the
 * end of the transaction, so a session variable set on one request's
 * borrowed connection can't still be set (wrong tenant!) the next time a
 * *different* request borrows that same connection from the pool. Plain
 * `SET` (session-level) would leak across requests exactly that way;
 * transaction-scoped `SET LOCAL` cannot.
 *
 * Only ProductsService currently reads through this transactional context
 * (via `this.txHost.tx.getRepository(Product)` instead of an injected
 * repository - see products.service.ts) - RLS/this interceptor is a
 * genuine, tested defense-in-depth layer for that one path, not a claim
 * that every tenant-scoped table now has it. Extending it to
 * categories/orders is the same pattern repeated: enable RLS + a policy on
 * that table, then switch that service to read through txHost.tx instead
 * of its injected repository. See docs/ARCHITECTURE.md §20 for why this
 * wasn't done for every table in this pass - it's a real, per-service
 * change, not a config flip, and each one needs the same verification
 * this one got (see rls.e2e coverage in app.e2e-spec.ts, which proves RLS
 * actually blocks a query with no storeId filter at all, not just that
 * normal app behavior still works).
 */
@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(
    @InjectTransactionHost()
    private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as unknown as { user?: AuthenticatedUser }).user;

    if (!user?.storeId) {
      // No tenant context (unauthenticated route, or a SuperAdmin acting
      // platform-wide with no single store) - nothing for RLS to scope to.
      return next.handle();
    }

    return from(
      this.txHost.withTransaction(async () => {
        // Parameterized via a query parameter, not string interpolation -
        // storeId is a JWT-verified UUID, not raw user input, but this
        // costs nothing and rules out any SQL-injection question outright.
        await this.txHost.tx.query(
          `SELECT set_config('app.current_store_id', $1, true)`,
          [user.storeId],
        );
        return lastValueFrom(next.handle());
      }),
    );
  }
}
