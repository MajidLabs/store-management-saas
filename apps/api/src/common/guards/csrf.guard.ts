import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Double-submit cookie CSRF protection. Only applies to browsers presenting
 * the auth cookies this project's frontend relies on - a request
 * authenticated via a Bearer header instead (Swagger UI, curl, a future
 * non-browser API client) has nothing for a malicious page to forge in the
 * first place, since there's no ambient cookie a browser would attach
 * automatically. Public/webhook routes are skipped for the same reason
 * Stripe's webhook can't and shouldn't carry a CSRF token.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) {
      return true;
    }

    const usingCookieAuth = Boolean(req.cookies?.['access_token']);
    if (!usingCookieAuth) {
      // No auth cookie on this request - it's a Bearer-token client
      // (Swagger UI, curl, a script), which CSRF doesn't apply to.
      return true;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME];

    if (
      typeof cookieToken !== 'string' ||
      typeof headerToken !== 'string' ||
      cookieToken.length === 0 ||
      cookieToken.length !== headerToken.length
    ) {
      throw new ForbiddenException('Missing or invalid CSRF token');
    }

    const cookieBuf = Buffer.from(cookieToken);
    const headerBuf = Buffer.from(headerToken);
    if (!timingSafeEqual(cookieBuf, headerBuf)) {
      throw new ForbiddenException('Missing or invalid CSRF token');
    }

    return true;
  }
}
