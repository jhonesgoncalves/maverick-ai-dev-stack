import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import configuration from '../config/configuration';
import { ProductsRepository } from './products.repository';
import { ProductsService } from './products.service';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('ProductsService', () => {
  let service: ProductsService;

  const make = (sku: string, price = 10) => service.create({ sku, name: `Product ${sku}`, price });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [configuration] })],
      providers: [ProductsService, ProductsRepository],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  it('creates an active product with id and timestamps', () => {
    const product = make('A-1');
    expect(product.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(product.active).toBe(true);
    expect(product.createdAt).toBeDefined();
    expect(product.updatedAt).toBeDefined();
  });

  it('rejects a duplicated sku and creates nothing', () => {
    make('A-1');
    expect(() => make('A-1')).toThrow(ConflictException);
    try {
      make('A-1');
    } catch (error) {
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'sku_conflict' });
    }
    expect(service.list({}).total).toBe(1);
  });

  it('keeps the sku of a deactivated product reserved', () => {
    const product = make('A-1');
    service.deactivate(product.id);
    expect(() => make('A-1')).toThrow(ConflictException);
  });

  it('throws NotFoundException for unknown ids', () => {
    expect(() => service.get(UNKNOWN_ID)).toThrow(NotFoundException);
    expect(() => service.update(UNKNOWN_ID, { name: 'x' })).toThrow(NotFoundException);
    expect(() => service.deactivate(UNKNOWN_ID)).toThrow(NotFoundException);
  });

  it('paginates in creation order', () => {
    const [a, b, c] = [make('A'), make('B'), make('C')];
    const first = service.list({ pageSize: 2 });
    expect(first).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(first.data.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(service.list({ page: 2, pageSize: 2 }).data.map((p) => p.id)).toEqual([c.id]);
  });

  it('hides inactive products unless includeInactive is set', () => {
    make('A');
    const b = make('B');
    service.deactivate(b.id);
    expect(service.list({})).toMatchObject({ total: 1 });
    expect(service.list({}).data.map((p) => p.sku)).toEqual(['A']);
    expect(service.list({ includeInactive: true }).data.map((p) => p.sku)).toEqual(['A', 'B']);
  });

  it('caps pageSize at the maximum', () => {
    expect(service.list({ pageSize: 500 }).pageSize).toBe(100);
  });

  it('updates fields, keeps the rest and renews updatedAt', () => {
    const product = make('A');
    const updated = service.update(product.id, { price: 19.9, name: 'New', description: 'desc', active: false });
    expect(updated).toMatchObject({ price: 19.9, name: 'New', description: 'desc', active: false, sku: 'A', createdAt: product.createdAt });
    expect(updated.updatedAt > product.updatedAt).toBe(true);
  });

  it('does not renew updatedAt on an empty patch', () => {
    const product = make('A');
    expect(service.update(product.id, {}).updatedAt).toBe(product.updatedAt);
  });

  it('reactivates a product so it returns to the default listing', () => {
    const product = make('A');
    service.deactivate(product.id);
    service.update(product.id, { active: true });
    expect(service.list({}).total).toBe(1);
  });

  it('deactivates but keeps the product readable', () => {
    const product = make('A');
    service.deactivate(product.id);
    expect(service.get(product.id).active).toBe(false);
  });

  it('deactivates idempotently', () => {
    const product = make('A');
    service.deactivate(product.id);
    const before = service.get(product.id);
    expect(() => service.deactivate(product.id)).not.toThrow();
    expect(service.get(product.id)).toEqual(before);
  });
});
