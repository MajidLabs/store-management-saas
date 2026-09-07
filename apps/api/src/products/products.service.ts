import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InjectTransactionHost,
  TransactionHost,
} from '@nestjs-cls/transactional';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { CategoriesService } from '../categories/categories.service';
import { Paginated, buildPaginationMeta } from '../common/dto/pagination.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectTransactionHost()
    private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
    private readonly categoriesService: CategoriesService,
  ) {}

  /**
   * Routes through RlsContextInterceptor's transaction (see its own
   * comment) rather than a plain injected repository - this is what
   * actually makes Postgres RLS apply to this service's queries. Fetched
   * fresh each call (not cached on `this`) because which transaction is
   * "current" changes per-request; caching a repository bound to one
   * request's transaction would leak it into the next.
   */
  private get products() {
    return this.txHost.tx.getRepository(Product);
  }

  async create(storeId: string, dto: CreateProductDto): Promise<Product> {
    if (dto.categoryId) {
      // Throws NotFoundException if the category doesn't exist or belongs to another store.
      await this.categoriesService.findOne(storeId, dto.categoryId);
    }
    const product = this.products.create({
      storeId,
      name: dto.name,
      description: dto.description ?? null,
      price: dto.price,
      stock: dto.stock ?? 0,
      categoryId: dto.categoryId ?? null,
    });
    return this.products.save(product);
  }

  async findAll(
    storeId: string,
    query: QueryProductDto,
  ): Promise<Paginated<Product>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.products
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.storeId = :storeId', { storeId });

    if (query.search) {
      qb.andWhere('product.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    }
    if (query.category) {
      qb.andWhere('product.categoryId = :category', {
        category: query.category,
      });
    }
    if (query.minPrice !== undefined) {
      qb.andWhere('product.price >= :minPrice', { minPrice: query.minPrice });
    }
    if (query.maxPrice !== undefined) {
      qb.andWhere('product.price <= :maxPrice', { maxPrice: query.maxPrice });
    }

    qb.orderBy('product.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(storeId: string, id: string): Promise<Product> {
    const product = await this.products.findOne({
      where: { id, storeId },
      relations: { category: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(
    storeId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(storeId, id);
    if (dto.categoryId) {
      await this.categoriesService.findOne(storeId, dto.categoryId);
    }
    Object.assign(product, dto);
    return this.products.save(product);
  }

  async remove(storeId: string, id: string): Promise<void> {
    const product = await this.findOne(storeId, id);
    await this.products.remove(product);
  }

  async setImage(
    storeId: string,
    id: string,
    imageUrl: string,
  ): Promise<Product> {
    const product = await this.findOne(storeId, id);
    product.imageUrl = imageUrl;
    return this.products.save(product);
  }

  /**
   * Standalone stock adjustment - NOT used by order creation. Order creation
   * decrements stock directly against the transactional EntityManager inside
   * OrdersService (same pattern as AuthService.register), because calling
   * this method from inside that transaction would use ProductsService's own
   * repository/connection and not actually be atomic with the order insert.
   */
  async decrementStock(
    storeId: string,
    id: string,
    quantity: number,
  ): Promise<Product> {
    const product = await this.findOne(storeId, id);
    if (product.stock < quantity) {
      throw new BadRequestException(
        `Insufficient stock for "${product.name}": requested ${quantity}, have ${product.stock}`,
      );
    }
    product.stock -= quantity;
    return this.products.save(product);
  }
}
