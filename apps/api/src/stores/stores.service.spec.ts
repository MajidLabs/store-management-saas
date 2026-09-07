import { ConflictException, ForbiddenException } from '@nestjs/common';
import { StoresService } from './stores.service';
import { Role } from '../common/enums/role.enum';
import { Plan } from '../common/enums/plan.enum';

describe('StoresService.inviteStaff (plan-limit enforcement)', () => {
  let stores: any;
  let users: any;
  let subscriptions: any;
  let service: StoresService;

  beforeEach(() => {
    stores = {};
    users = {
      findOne: jest.fn().mockResolvedValue(null), // no existing account with that email
      count: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((data) => Promise.resolve({ id: 'new-staff-id', ...data })),
    };
    subscriptions = { findOne: jest.fn() };
    service = new StoresService(stores, users, subscriptions);
  });

  it('allows inviting staff when under the FREE plan limit (maxStaff=1, currently 0)', async () => {
    subscriptions.findOne.mockResolvedValue({ plan: Plan.FREE });
    users.count.mockResolvedValue(0);

    const result = await service.inviteStaff('store-1', {
      email: 'staff@example.com',
      password: 'password123',
    });

    expect(result).toMatchObject({
      email: 'staff@example.com',
      role: Role.STAFF,
    });
  });

  it('blocks inviting staff once the FREE plan limit (1) is reached', async () => {
    subscriptions.findOne.mockResolvedValue({ plan: Plan.FREE });
    users.count.mockResolvedValue(1);

    await expect(
      service.inviteStaff('store-1', {
        email: 'staff2@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(users.save).not.toHaveBeenCalled();
  });

  it('allows more staff under the PRO plan limit (10) at the same headcount that blocked FREE', async () => {
    subscriptions.findOne.mockResolvedValue({ plan: Plan.PRO });
    users.count.mockResolvedValue(1);

    const result = await service.inviteStaff('store-1', {
      email: 'staff2@example.com',
      password: 'password123',
    });

    expect(result).toMatchObject({ email: 'staff2@example.com' });
  });

  it('rejects inviting an email that already has an account', async () => {
    users.findOne.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.inviteStaff('store-1', {
        email: 'taken@example.com',
        password: 'password123',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
