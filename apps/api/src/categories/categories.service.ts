import { Injectable, NotFoundException } from '@nestjs/common';
import {
  InjectTransactionHost,
  TransactionHost,
} from '@nestjs-cls/transactional';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { Category } from './entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectTransactionHost()
    private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
  ) {}

  /**
   * Routes through RlsContextInterceptor's transaction rather than a plain
   * injected repository - see ProductsService's identical getter for the
   * full explanation. `categories` got the same tenant_isolation policy as
   * `products` in EnableRlsOnOrdersAndCategories; this getter is the other
   * half that actually makes it apply to this service's queries.
   */
  private get categories() {
    return this.txHost.tx.getRepository(Category);
  }

  create(storeId: string, dto: CreateCategoryDto): Promise<Category> {
    return this.categories.save(
      this.categories.create({ storeId, name: dto.name }),
    );
  }

  findAll(storeId: string): Promise<Category[]> {
    return this.categories.find({ where: { storeId }, order: { name: 'ASC' } });
  }

  async findOne(storeId: string, id: string): Promise<Category> {
    const category = await this.categories.findOne({ where: { id, storeId } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async update(
    storeId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findOne(storeId, id);
    Object.assign(category, dto);
    return this.categories.save(category);
  }

  async remove(storeId: string, id: string): Promise<void> {
    const category = await this.findOne(storeId, id);
    await this.categories.remove(category);
  }
}
