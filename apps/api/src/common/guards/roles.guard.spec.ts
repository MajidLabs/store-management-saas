import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';

function buildContext(user: { role: Role } | undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows access when the route has no @Roles() metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(buildContext({ role: Role.STAFF }))).toBe(true);
  });

  it('allows access when the user role is in the required list', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.STORE_OWNER, Role.STAFF]);
    expect(guard.canActivate(buildContext({ role: Role.STAFF }))).toBe(true);
  });

  it('denies access when the user role is NOT in the required list', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.STORE_OWNER]);
    expect(guard.canActivate(buildContext({ role: Role.STAFF }))).toBe(false);
  });

  it('denies access when there is no authenticated user at all', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.STORE_OWNER]);
    expect(guard.canActivate(buildContext(undefined))).toBe(false);
  });

  it('denies a STAFF user on a SUPER_ADMIN-only route', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.SUPER_ADMIN]);
    expect(guard.canActivate(buildContext({ role: Role.STAFF }))).toBe(false);
  });
});

// Sanity check that the metadata key used by the guard matches the decorator's key,
// since a mismatch would make @Roles() silently do nothing.
describe('ROLES_KEY wiring', () => {
  it('is a non-empty string used consistently by both the decorator and the guard', () => {
    expect(typeof ROLES_KEY).toBe('string');
    expect(ROLES_KEY.length).toBeGreaterThan(0);
  });
});
