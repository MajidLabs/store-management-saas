import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class StoreSuspensionGuard implements CanActivate {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser | undefined = request.user;

    // No user (public route) or SuperAdmin (storeId is always null) - nothing to check.
    if (!user || !user.storeId) {
      return true;
    }

    const store = await this.stores.findOne({ where: { id: user.storeId } });
    if (store?.isSuspended) {
      throw new UnauthorizedException(
        'This store has been suspended. Contact support.',
      );
    }
    return true;
  }
}
