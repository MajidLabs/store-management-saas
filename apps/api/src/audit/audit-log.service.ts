import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { Paginated, buildPaginationMeta } from '../common/dto/pagination.dto';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  async findForStore(
    storeId: string,
    page = 1,
    limit = 20,
  ): Promise<Paginated<AuditLog>> {
    // storeId alone would miss a SuperAdmin action against this store (e.g.
    // suspending it) - the actor's own storeId is null in that case (a
    // SuperAdmin isn't a member of any store), so the only way to
    // recognize "this happened to my store" is the target, not the actor.
    const [data, total] = await this.logs
      .createQueryBuilder('log')
      .where('log.storeId = :storeId', { storeId })
      .orWhere('log.targetId = :storeId', { storeId })
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { data, meta: buildPaginationMeta(total, page, limit) };
  }
}
