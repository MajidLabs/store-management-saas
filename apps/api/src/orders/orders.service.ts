import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  InjectTransactionHost,
  TransactionHost,
} from '@nestjs-cls/transactional';
import { TransactionalAdapterTypeOrm } from '@nestjs-cls/transactional-adapter-typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Product } from '../products/entities/product.entity';
import { Store } from '../stores/entities/store.entity';
import { User } from '../users/entities/user.entity';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { OrderStatus } from '../common/enums/order-status.enum';
import { Paginated, buildPaginationMeta } from '../common/dto/pagination.dto';
import { OutboxService } from '../outbox/outbox.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectTransactionHost()
    private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Uses txHost.withTransaction, not the raw DataSource.transaction this
   * replaced - critically, when a transaction is already active on the CLS
   * context (RlsContextInterceptor already started one for this request -
   * see its own comment), withTransaction reuses that SAME transaction/
   * connection rather than opening an independent one. That's what keeps
   * the Product reads/writes below inside the connection that actually has
   * `app.current_store_id` set - DataSource.transaction() grabs a fresh
   * connection from the pool with no such awareness, which would silently
   * see zero products once RLS + the restricted app_runtime role are
   * active (see docs/ARCHITECTURE.md §20 - caught by tracing through what
   * actually holds the connection here before shipping, not discovered by
   * a test failure after).
   */
  async create(storeId: string, dto: CreateOrderDto): Promise<Order> {
    return this.txHost.withTransaction(async () => {
      const manager = this.txHost.tx;
      const productRepo = manager.getRepository(Product);
      let total = 0;
      const items: OrderItem[] = [];

      for (const line of dto.items) {
        // Row lock so two concurrent orders for the same product can't both
        // pass the stock check before either one's decrement is committed.
        const product = await productRepo
          .createQueryBuilder('product')
          .setLock('pessimistic_write')
          .where('product.id = :id AND product.storeId = :storeId', {
            id: line.productId,
            storeId,
          })
          .getOne();

        if (!product) {
          throw new NotFoundException(`Product ${line.productId} not found`);
        }
        if (product.stock < line.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}": requested ${line.quantity}, have ${product.stock}`,
          );
        }

        product.stock -= line.quantity;
        await productRepo.save(product);

        const item = manager.create(OrderItem, {
          productId: product.id,
          productName: product.name,
          quantity: line.quantity,
          unitPrice: product.price,
        });
        items.push(item);
        total += product.price * line.quantity;
      }

      const newOrder = manager.create(Order, {
        storeId,
        status: OrderStatus.PENDING,
        total,
        items,
      });
      const savedOrder = await manager.save(newOrder);

      // Written inside this same transaction, not after it - see
      // OutboxService's class comment and docs/ARCHITECTURE.md §20's
      // outbox section for why "enqueue after commit" (what this replaced)
      // isn't crash-safe the way this is. Store/owner are looked up here,
      // inside the transaction, with the resulting email fully rendered
      // into the outbox row - OutboxProcessor just enqueues payload
      // verbatim, no further business logic or lookups needed later.
      const store = await manager
        .getRepository(Store)
        .findOne({ where: { id: storeId } });
      const owner = store
        ? await manager
            .getRepository(User)
            .findOne({ where: { id: store.ownerId } })
        : null;
      if (store && owner) {
        await this.outbox.writeSendEmail(manager, {
          to: owner.email,
          subject: `New order for ${store.name}`,
          html: `<p>A new order (${savedOrder.id}) was created for <strong>${store.name}</strong>, total $${savedOrder.total.toFixed(2)}.</p>`,
        });
      }

      return savedOrder;
    });
  }

  async findAll(
    storeId: string,
    query: QueryOrderDto,
  ): Promise<Paginated<Order>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.orders
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .where('order.storeId = :storeId', { storeId });

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }
    if (query.from) {
      qb.andWhere('order.createdAt >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('order.createdAt <= :to', { to: query.to });
    }

    qb.orderBy('order.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // getManyAndCount with a joined one-to-many can miscount; count separately.
    const data = await qb.getMany();
    const total = await qb.getCount();

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(storeId: string, id: string): Promise<Order> {
    const order = await this.orders.findOne({
      where: { id, storeId },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async updateStatus(
    storeId: string,
    id: string,
    dto: UpdateOrderStatusDto,
  ): Promise<Order> {
    return this.txHost.withTransaction(async () => {
      const manager = this.txHost.tx;
      const order = await manager.findOne(Order, {
        where: { id, storeId },
        relations: { items: true },
      });
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const isNewlyCancelled =
        dto.status === OrderStatus.CANCELLED &&
        order.status !== OrderStatus.CANCELLED;

      if (isNewlyCancelled) {
        const productRepo = manager.getRepository(Product);
        for (const item of order.items) {
          if (!item.productId) continue; // product was deleted since - nothing to restock
          await productRepo.increment(
            { id: item.productId, storeId },
            'stock',
            item.quantity,
          );
        }
      }

      order.status = dto.status;
      return manager.save(order);
    });
  }
}
