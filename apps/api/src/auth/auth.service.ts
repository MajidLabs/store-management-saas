import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { User } from '../users/entities/user.entity';
import { Store } from '../stores/entities/store.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Role } from '../common/enums/role.enum';
import { Plan, PLAN_LIMITS } from '../common/enums/plan.enum';
import { SubscriptionStatus } from '../common/enums/subscription-status.enum';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './strategies/jwt-access.strategy';
import { MailQueueService } from '../queue/mail-queue.service';

const SALT_ROUNDS = 10;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * SHA-256 of the raw reset token, used as the DB-stored/queried value.
 * Not bcrypt: the input here is already a 256-bit random value (not a
 * human password), so a salt adds nothing, and a deterministic hash is
 * what lets resetPassword look up the owning user directly by token.
 */
export function hashResetToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailQueueService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.dataSource.transaction(async (manager) => {
      let user = manager.create(User, {
        email: dto.email,
        passwordHash,
        role: Role.STORE_OWNER,
        storeId: null,
      });
      user = await manager.save(user);

      const store = await manager.save(
        manager.create(Store, { name: dto.storeName, ownerId: user.id }),
      );

      await manager.save(
        manager.create(Subscription, {
          storeId: store.id,
          plan: Plan.FREE,
          status: SubscriptionStatus.ACTIVE,
        }),
      );

      user.storeId = store.id;
      return manager.save(user);
    });

    await this.mail.enqueue({
      to: user.email,
      subject: `Welcome to Store SaaS, ${dto.storeName}!`,
      html: `<p>Your store <strong>${dto.storeName}</strong> is ready. You're on the Free plan - upgrade any time from the billing section.</p>`,
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.store', 'store')
      .leftJoinAndSelect('store.subscription', 'subscription')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.store?.isSuspended) {
      throw new UnauthorizedException(
        'This store has been suspended. Contact support.',
      );
    }

    // Second-line defense for the staff-limit-on-downgrade bug: a plan
    // downgrade can arrive via a Stripe webhook that we cannot block
    // (BillingService.assertStaffFitsPlan only guards the direct/immediate
    // checkout path). If the store is currently over its plan's staff
    // limit - however that happened - block staff logins until the owner
    // fixes it. The owner is exempt so they can always get in to resolve it.
    if (user.role === Role.STAFF && user.store) {
      const plan = user.store.subscription?.plan ?? Plan.FREE;
      const limit = PLAN_LIMITS[plan].maxStaff;
      const staffCount = await this.users.count({
        where: { storeId: user.store.id, role: Role.STAFF },
      });
      if (staffCount > limit) {
        throw new UnauthorizedException(
          "This store's plan no longer covers the current number of staff members. Ask the store owner to upgrade the plan or remove staff.",
        );
      }
    }

    return this.issueTokens(user);
  }

  async refresh(
    userId: string,
    presentedRefreshToken: string,
  ): Promise<TokenPair> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.refreshTokenHash')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matches = await bcrypt.compare(
      presentedRefreshToken,
      user.refreshTokenHash,
    );
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async logout(userId: string): Promise<void> {
    await this.users.update(userId, { refreshTokenHash: null });
  }

  /**
   * Always resolves the same way regardless of whether the email exists,
   * to avoid leaking which emails have accounts (user enumeration).
   * Callers must not branch on the result to reveal existence either.
   */
  async requestPasswordReset(dto: RequestPasswordResetDto): Promise<void> {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user) {
      return;
    }

    const rawToken = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    // SHA-256, not bcrypt: this token is a high-entropy random value (256
    // bits), not a human password, so it needs no salt - and being
    // deterministic lets resetPassword look the user up directly by hash
    // instead of needing the email carried alongside the token.
    const passwordResetTokenHash = hashResetToken(rawToken);
    const passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.users.update(user.id, {
      passwordResetTokenHash,
      passwordResetExpiresAt,
    });

    const resetUrl = `${this.config.get<string>('WEB_APP_URL')}/reset-password?token=${rawToken}`;

    await this.mail.enqueue({
      to: user.email,
      subject: 'Reset your password',
      html: `<p>We received a request to reset your password. This link expires in 1 hour and can only be used once.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email - your password won't be changed.</p>`,
    });
  }

  /**
   * Single-use: on success, both the reset token and every existing
   * refresh token are invalidated, so a session an attacker may already
   * hold is cut off too - not just future logins with the old password.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashResetToken(dto.token);

    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordResetTokenHash')
      .addSelect('user.passwordResetExpiresAt')
      .where('user.passwordResetTokenHash = :tokenHash', { tokenHash })
      .getOne();

    const invalid = () =>
      new UnauthorizedException('Invalid or expired reset token');

    if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
      throw invalid();
    }
    if (user.passwordResetExpiresAt.getTime() < Date.now()) {
      throw invalid();
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    await this.users.update(user.id, {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      // Also revoke any active session's refresh token: a reset should
      // mean "everyone currently logged in as me is logged out", not just
      // "the next login needs the new password."
      refreshTokenHash: null,
    });
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRY') as any,
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRY') as any,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);
    await this.users.update(user.id, { refreshTokenHash });

    return { accessToken, refreshToken };
  }
}
