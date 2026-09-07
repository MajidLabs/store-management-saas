import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from './jwt-access.strategy';

export interface RefreshTokenUser {
  id: string;
  email: string;
  role: string;
  storeId: string | null;
  refreshToken: string;
}

/** Same cookie-first, header-fallback pattern as the access strategy. */
function extractRefreshToken(req: Request): string | null {
  const fromCookie = req.cookies?.['refresh_token'];
  if (typeof fromCookie === 'string' && fromCookie.length > 0) {
    return fromCookie;
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: extractRefreshToken,
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): RefreshTokenUser {
    const refreshToken = extractRefreshToken(req) ?? '';
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      storeId: payload.storeId,
      refreshToken,
    };
  }
}
