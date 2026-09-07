import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from '../stores/entities/store.entity';
import {
  PaginationQueryDto,
  Paginated,
  buildPaginationMeta,
} from '../common/dto/pagination.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Store) private readonly stores: Repository<Store>,
  ) {}

  async findAllStores(query: PaginationQueryDto): Promise<Paginated<Store>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await this.stores.findAndCount({
      relations: { subscription: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async setSuspended(storeId: string, suspended: boolean): Promise<Store> {
    const store = await this.stores.findOne({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException('Store not found');
    }
    store.isSuspended = suspended;
    return this.stores.save(store);
  }
}
