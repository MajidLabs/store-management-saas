import { Response } from 'express';
import { randomBytes } from 'crypto';

/**
 * Parses this project's duration-string format (e.g. '15m', '7d', '30s',
 * '2h') into milliseconds. Deliberately minimal - only the units this
 * project's .env.example actually uses - rather than pulling in a
 * general-purpose duration-parsing dependency for one conversion.
 */
export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    throw new Error(
      `Unrecognized duration format: "${duration}" (expected e.g. "15m", "7d")`,
    );
  }
  const value = Number(match[1]);
  const unitMs: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * unitMs[match[2]];
}

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const CSRF_TOKEN_COOKIE = 'csrf_token';

interface SetAuthCookiesParams {
  res: Response;
  accessToken: string;
  refreshToken: string;
  accessExpiry: string;
  refreshExpiry: string;
  /**
   * True only when actually served over HTTPS. Deliberately NOT derived
   * from NODE_ENV: this project's docker-compose.yml sets
   * NODE_ENV=production while still serving plain HTTP (no TLS
   * termination configured there), so gating on NODE_ENV would silently
   * break every login in the default local Docker setup - the cookie
   * would never be sent back by the browser. Read from the dedicated
   * COOKIE_SECURE env var instead, which defaults to false to match how
   * this project runs today; set it to true only once genuinely behind
   * HTTPS (see docs/DEPLOYMENT.md).
   */
  secure: boolean;
}

/**
 * Sets all three auth-related cookies together, so no endpoint can
 * accidentally set the token cookies without also rotating the CSRF
 * token (which would leave the old CSRF token valid for a new session -
 * a subtle bug were this split across call sites instead of centralized
 * here). Returns the new CSRF token so the caller can hand it back to
 * the frontend some other way if ever needed (currently unused, but
 * cheap to return since the guard only reads it from the cookie anyway).
 */
export function setAuthCookies(params: SetAuthCookiesParams): string {
  const {
    res,
    accessToken,
    refreshToken,
    accessExpiry,
    refreshExpiry,
    secure,
  } = params;

  const csrfToken = randomBytes(32).toString('hex');

  // access_token: sent with every request, so no path restriction.
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: parseDurationToMs(accessExpiry),
  });

  // refresh_token: scoped to /auth so it's only ever sent to the
  // endpoints that actually need it (refresh, logout) - not attached to
  // every product/order/etc. request where it serves no purpose and
  // only adds exposure if that request or a proxy along the way logs
  // headers/cookies.
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/auth',
    maxAge: parseDurationToMs(refreshExpiry),
  });

  // csrf_token: deliberately NOT httpOnly - the frontend must be able to
  // read it with JS to echo it back in the X-CSRF-Token header. This is
  // the standard double-submit pattern: safe specifically because an
  // attacker's page can't read this cookie either (same-origin policy
  // still applies to cookie reads), so it can't forge a matching header.
  res.cookie(CSRF_TOKEN_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: parseDurationToMs(refreshExpiry),
  });

  return csrfToken;
}

/** Clears all three auth cookies on logout - path must match what was
 * used to set each one, or the browser won't recognize it as the same
 * cookie to clear. */
export function clearAuthCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
  });
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    path: '/auth',
    httpOnly: true,
    secure,
    sameSite: 'lax',
  });
  res.clearCookie(CSRF_TOKEN_COOKIE, {
    path: '/',
    httpOnly: false,
    secure,
    sameSite: 'lax',
  });
}
