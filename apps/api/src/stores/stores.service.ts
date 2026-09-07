import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Store } from './entities/store.entity';
import { User } from '../users/entities/user.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Role } from '../common/enums/role.enum';
import { PLAN_LIMITS } from '../common/enums/plan.enum';
import {
  UpdateStoreDto,
  InviteStaffDto,
  UpdateStaffDto,
} from './dto/store.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class StoresService {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
  ) {}

  async findMine(storeId: string): Promise<Store> {
    const store = await this.stores.findOne({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    return store;
  }

  async updateMine(storeId: string, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.findMine(storeId);
    Object.assign(store, dto);
    return this.stores.save(store);
  }

  listStaff(storeId: string): Promise<User[]> {
    return this.users.find({
      where: { storeId, role: Role.STAFF },
      order: { createdAt: 'ASC' },
    });
  }

  async inviteStaff(storeId: string, dto: InviteStaffDto): Promise<User> {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const subscription = await this.subscriptions.findOne({
      where: { storeId },
    });
    const currentStaffCount = await this.users.count({
      where: { storeId, role: Role.STAFF },
    });
    const limit = subscription ? PLAN_LIMITS[subscription.plan].maxStaff : 0;

    if (currentStaffCount >= limit) {
      throw new ForbiddenException(
        `Staff limit reached for the ${subscription?.plan ?? 'current'} plan (max ${limit}). Upgrade to add more staff.`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const staff = this.users.create({
      email: dto.email,
      passwordHash,
      role: Role.STAFF,
      storeId,
    });
    return this.users.save(staff);
  }

  async updateStaff(
    storeId: string,
    staffId: string,
    dto: UpdateStaffDto,
  ): Promise<User> {
    const staff = await this.findStaffOrThrow(storeId, staffId);
    if (dto.email) staff.email = dto.email;
    if (dto.password)
      staff.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    return this.users.save(staff);
  }

  async removeStaff(storeId: string, staffId: string): Promise<void> {
    const staff = await this.findStaffOrThrow(storeId, staffId);
    await this.users.remove(staff);
  }

  private async findStaffOrThrow(
    storeId: string,
    staffId: string,
  ): Promise<User> {
    const staff = await this.users.findOne({
      where: { id: staffId, storeId, role: Role.STAFF },
    });
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }
    return staff;
  }
}
