import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { Request, Response } from 'express';
import { Observable, catchError, concatMap, from, of } from 'rxjs';
import { IdempotencyRecord } from './idempotency-record.entity';
import { IDEMPOTENT_KEY } from './idempotent.decorator';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

/**
 * For a route marked @Idempotent(), a request carrying an `Idempotency-Key`
 * header is cached by (storeId, route, key). A retry with the same key
 * returns the original response verbatim instead of re-running the
 * handler - so a client timeout that retries "create order" can't create
 * two orders, and a retried "create checkout session" can't open two
 * Stripe sessions for the same intent.
 *
 * No header present - the route works exactly as before, unchanged.
 * Idempotency is opt-in per request (the client provides the key), the
 * same model Stripe's own API uses, not something forced onto every
 * caller.
 *
 * Two concurrent requests carrying the *same* key are handled by reserving
 * the row (an INSERT of a placeholder) before the handler runs, not after -
 * the primary key constraint makes only one INSERT able to win, so a
 * second request arriving while the first is still in flight gets 409
 * rather than also running the handler. Without this reservation step
 * (only recording the response after the handler finishes), two truly
 * concurrent requests could both see "nothing cached yet" and both
 * proceed - the exact duplicate this exists to prevent.
 *
 * The record-the-result step is genuinely awaited (via concatMap), not
 * fired-and-forgotten - an earlier draft used a fire-and-forget write here,
 * which let the HTTP response complete (and in a test, the app/DB
 * connection close) before that write was guaranteed to land, intermittently
 * surfacing as a bare "Connection terminated" error with no clear cause.
 * Awaiting it means the response genuinely isn't "done" until the
 * idempotency record actually exists to be replayed by a retry.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(IdempotencyRecord)
    private readonly records: Repository<IdempotencyRecord>,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const isIdempotent = this.reflector.get<boolean>(
      IDEMPOTENT_KEY,
      context.getHandler(),
    );
    const req = context.switchToHttp().getRequest<Request>();
    const clientKey = req.header('Idempotency-Key');
    if (!isIdempotent || !clientKey) {
      return next.handle();
    }

    const user = (req as unknown as { user?: AuthenticatedUser }).user;
    const cacheKey = `${user?.storeId ?? 'anonymous'}:${req.route?.path ?? req.path}:${clientKey}`;

    const existing = await this.records.findOne({ where: { id: cacheKey } });
    if (existing) {
      if (existing.statusCode === 0) {
        // Reserved by a still-in-flight request for this same key - not a
        // finished, replayable result yet.
        throw new ConflictException(
          'A request with this Idempotency-Key is already being processed',
        );
      }
      const res = context.switchToHttp().getResponse<Response>();
      res.status(existing.statusCode);
      return of(existing.responseBody);
    }

    try {
      await this.records.insert({
        id: cacheKey,
        statusCode: 0,
        responseBody: null,
      });
    } catch (err) {
      const isUniqueViolation = (err as { code?: string })?.code === '23505';
      if (!isUniqueViolation) {
        throw err;
      }
      // Lost the race to reserve this key to a genuinely concurrent
      // request - same outcome as finding it already reserved above.
      throw new ConflictException(
        'A request with this Idempotency-Key is already being processed',
      );
    }

    return next.handle().pipe(
      concatMap(async (body: unknown) => {
        const res = context.switchToHttp().getResponse<Response>();
        await this.records.update(cacheKey, {
          statusCode: res.statusCode,
          responseBody: (body ?? null) as object,
        });
        return body;
      }),
      catchError((err) =>
        from(
          (async () => {
            // The handler failed - delete the reservation rather than
            // caching a failure, so a legitimate retry (the client fixing
            // whatever caused the error, or it being transient) isn't
            // permanently stuck replaying that same failure forever.
            await this.records.delete(cacheKey);
            throw err;
          })(),
        ),
      ),
    );
  }
}
