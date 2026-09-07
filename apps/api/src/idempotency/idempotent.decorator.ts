import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent';

/**
 * Marks a route as supporting the `Idempotency-Key` request header - see
 * IdempotencyInterceptor for what that actually does. Opt-in per route
 * (not global) because caching and replaying a response is only correct
 * for a route that creates/charges something; blindly applying it
 * everywhere would, for example, replay a stale GET response to a client
 * that's since made changes elsewhere.
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
