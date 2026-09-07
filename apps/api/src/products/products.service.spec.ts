import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';

function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    storeId: 'store-1',
    categoryId: null,
    category: null,
    name: 'Latte',
    description: null,
    price: 4.5,
    stock: 5,
    imageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product;
}

describe('ProductsService.decrementStock', () => {
  let repo: { findOne: jest.Mock; save: jest.Mock };
  let categoriesService: { findOne: jest.Mock };
  let txHost: { tx: { getRepository: jest.Mock } };
  let service: ProductsService;

  beforeEach(() => {
    repo = { findOne: jest.fn(), save: jest.fn((p) => Promise.resolve(p)) };
    categoriesService = { findOne: jest.fn() };
    // ProductsService reads its repository via txHost.tx.getRepository(),
    // not a plain injected Repository - see its own class comment for why
    // (RLS needs queries to run inside the same transaction/connection
    // RlsContextInterceptor set app.current_store_id on). This mock
    // doesn't exercise RLS itself (that needs a real Postgres connection -
    // see the e2e Row-Level Security suite in test/app.e2e-spec.ts for
    // that); it only needs to return the same repo mock every call so the
    // stock-decrement logic under test still runs.
    txHost = { tx: { getRepository: jest.fn(() => repo) } };
    service = new ProductsService(txHost as any, categoriesService as any);
  });

  it('decrements stock when there is enough available', async () => {
    repo.findOne.mockResolvedValue(buildProduct({ stock: 5 }));

    const result = await service.decrementStock('store-1', 'prod-1', 2);

    expect(result.stock).toBe(3);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 3 }),
    );
  });

  it('throws BadRequestException when the requested quantity exceeds stock', async () => {
    repo.findOne.mockResolvedValue(buildProduct({ stock: 1 }));

    await expect(
      service.decrementStock('store-1', 'prod-1', 5),
    ).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('allows decrementing exactly down to zero (boundary case)', async () => {
    repo.findOne.mockResolvedValue(buildProduct({ stock: 3 }));

    const result = await service.decrementStock('store-1', 'prod-1', 3);

    expect(result.stock).toBe(0);
  });

  it('throws NotFoundException when the product does not belong to this store', async () => {
    repo.findOne.mockResolvedValue(null);

    await expect(
      service.decrementStock('store-1', 'prod-1', 1),
    ).rejects.toThrow(NotFoundException);
  });
});
