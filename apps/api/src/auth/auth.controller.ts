import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtRefreshGuard } from '../common/guards/jwt-refresh.guard';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../common/decorators/current-user.decorator';
import { RefreshTokenUser } from './strategies/jwt-refresh.strategy';
import { setAuthCookies, clearAuthCookies } from './cookie.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get cookieSecure(): boolean {
    return this.config.get<string>('COOKIE_SECURE') === 'true';
  }

  private applyTokens(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    setAuthCookies({
      res,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessExpiry: this.config.get<string>('JWT_ACCESS_EXPIRY') as string,
      refreshExpiry: this.config.get<string>('JWT_REFRESH_EXPIRY') as string,
      secure: this.cookieSecure,
    });
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({
    summary:
      'Register a new store owner, creating their store and a Free subscription. Tokens are set as httpOnly cookies, not returned in the body.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.register(dto);
    this.applyTokens(res, tokens);
    return { success: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Log in. Tokens are set as httpOnly cookies, not returned in the body.',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto);
    this.applyTokens(res, tokens);
    return { success: true };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Exchange a valid refresh token (from the httpOnly cookie, or a Bearer header for non-browser clients) for a new pair, set as cookies.',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as RefreshTokenUser;
    const tokens = await this.authService.refresh(user.id, user.refreshToken);
    this.applyTokens(res, tokens);
    return { success: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate the current refresh token' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.id);
    clearAuthCookies(res, this.cookieSecure);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Return the current session's user (from the verified access cookie/token). Used by the frontend in place of decoding the access token client-side, since it's httpOnly.",
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-password-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Request a password reset email. Always returns 204 whether or not the email exists, to avoid revealing which accounts are registered.',
  })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    await this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Complete a password reset using the token emailed by /auth/request-password-reset. Single-use; also revokes any existing session.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
  }
}
