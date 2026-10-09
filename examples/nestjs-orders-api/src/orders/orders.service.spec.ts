import { BadRequestException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { CacheService } from '../common/cache/cache.service';
import configuration from '../config/configuration';
import { CustomersRepository } from '../customers/customers.repository';
import { CustomersService } from '../customers/customers.service';
import { PaymentsService } from '../payments/payments.service';
import { encodeCursor } from './order-cursor';
import { Order } from './order.entity';
import { OrdersRepository } from './orders.repository';
import { orderTotal } from './order-pricing';
import { OrdersService } from './orders.service';

type CursorPage = { data: Order[]; nextCursor: string | null };
type OffsetPage = { data: Order[]; page: number; pageSize: number; total: number };

const API_KEY = 'dev-api-key';

async function expectBadRequest(action: () => Promise<unknown>, code: string): Promise<void> {
  const promise = action();
  await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  await promise.catch((error: BadRequestException) => {
    expect(error.getResponse()).toMatchObject({ code });
  });
}

describe('OrdersService', () => {
  let service: OrdersService;
  let repository: OrdersRepository;
  let events: EventEmitter2;
  const payments = { charge: jest.fn(async () => ({ id: 'pay_1', status: 'succeeded', amount: 0 })), refund: jest.fn(async () => undefined) };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [configuration] }), EventEmitterModule.forRoot()],
      providers: [OrdersService, OrdersRepository, CustomersService, CustomersRepository, CacheService, { provide: PaymentsService, useValue: payments }],
    }).compile();
    service = moduleRef.get(OrdersService);
    repository = moduleRef.get(OrdersRepository);
    events = moduleRef.get(EventEmitter2);
    jest.clearAllMocks();
  });

  it('computes order totals with cent precision', () => {
    expect(orderTotal({ items: [{ sku: 'a', quantity: 3, unitPrice: 0.1 }, { sku: 'b', quantity: 1, unitPrice: 9.99 }] })).toBe(10.29);
  });

  it('creates a paid order and emits order.created', async () => {
    const emit = jest.spyOn(events, 'emit');
    const order = await service.create({ customerId: 'c-1', items: [{ sku: 'book', quantity: 2, unitPrice: 25 }] });
    expect(order.status).toBe('paid');
    expect(order.total).toBe(50);
    expect(emit).toHaveBeenCalledWith('order.created', expect.objectContaining({ orderId: order.id, total: 50 }));
  });

  it('rejects orders for unknown customers', async () => {
    await expect(service.create({ customerId: 'nope', items: [{ sku: 'x', quantity: 1, unitPrice: 1 }] })).rejects.toThrow('customer nope not found');
  });

  it('paginates and filters orders', async () => {
    for (let i = 0; i < 5; i++) await service.create({ customerId: i % 2 ? 'c-2' : 'c-1', items: [{ sku: `s${i}`, quantity: 1, unitPrice: 10 }] });
    const page = (await service.list({ customerId: 'c-1', page: 1, pageSize: 2 })) as OffsetPage;
    expect(page.total).toBe(3);
    expect(page.data).toHaveLength(2);
  });

  it('refunds paid orders on cancel', async () => {
    const order = await service.create({ customerId: 'c-1', items: [{ sku: 'x', quantity: 1, unitPrice: 5 }] });
    await service.cancel(order.id);
    expect(payments.refund).toHaveBeenCalledWith('pay_1');
    expect(service.get(order.id).status).toBe('cancelled');
  });

  it('paginates by cursor across pages without repeating orders, ending with a null cursor (UT-01, UT-02, UT-12)', async () => {
    const empty = (await service.list({ limit: '2' })) as CursorPage;
    expect(empty).toEqual({ data: [], nextCursor: null });

    const created: Order[] = [];
    for (let i = 0; i < 3; i++) {
      created.push(await service.create({ customerId: 'c-1', items: [{ sku: `s${i}`, quantity: 1, unitPrice: 10 }] }));
    }

    const first = (await service.list({ limit: '2' })) as CursorPage;
    expect(first.data.map(order => order.id)).toEqual([created[0].id, created[1].id]);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first).not.toHaveProperty('page');
    expect(first).not.toHaveProperty('pageSize');
    expect(first).not.toHaveProperty('total');

    const second = (await service.list({ limit: '2', cursor: first.nextCursor! })) as CursorPage;
    expect(second.data.map(order => order.id)).toEqual([created[2].id]);
    expect(second.nextCursor).toBeNull();
  });

  it('defaults to a limit of 20 when only a cursor is given (UT-03)', async () => {
    const firstOrder = await service.create({ customerId: 'c-1', items: [{ sku: 'a', quantity: 1, unitPrice: 1 }] });
    await service.create({ customerId: 'c-1', items: [{ sku: 'b', quantity: 1, unitPrice: 1 }] });
    for (let i = 0; i < 21; i++) await service.create({ customerId: 'c-1', items: [{ sku: `s${i}`, quantity: 1, unitPrice: 1 }] });

    const firstPage = (await service.list({ limit: '1' })) as CursorPage;
    expect(firstPage.data.map(order => order.id)).toEqual([firstOrder.id]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const nextPage = (await service.list({ cursor: firstPage.nextCursor! })) as CursorPage;
    expect(nextPage.data).toHaveLength(20);
    expect(nextPage.nextCursor).toEqual(expect.any(String));
  });

  it('keeps every filtered order exactly once across cursor pages (UT-04)', async () => {
    const c1: Order[] = [];
    for (let i = 0; i < 3; i++) {
      c1.push(await service.create({ customerId: 'c-1', items: [{ sku: `c1-${i}`, quantity: 1, unitPrice: 1 }] }));
      await service.create({ customerId: 'c-2', items: [{ sku: `c2-${i}`, quantity: 1, unitPrice: 1 }] });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = (await service.list({ customerId: 'c-1', limit: '2', cursor })) as CursorPage;
      seen.push(...page.data.map(order => order.id));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }

    expect(seen).toEqual(c1.map(order => order.id));
  });

  it('rejects a cursor reused with different filters (UT-05)', async () => {
    await service.create({ customerId: 'c-1', items: [{ sku: 'x', quantity: 1, unitPrice: 1 }] });
    await service.create({ customerId: 'c-1', items: [{ sku: 'y', quantity: 1, unitPrice: 1 }] });
    const paidPage = (await service.list({ status: 'paid', limit: '1' })) as CursorPage;
    expect(paidPage.nextCursor).toEqual(expect.any(String));

    await expectBadRequest(() => service.list({ status: 'pending', cursor: paidPage.nextCursor! }), 'invalid_cursor');
  });

  it('places an order created between pages at the end without duplicating or skipping earlier ones (UT-06)', async () => {
    const o1 = await service.create({ customerId: 'c-1', items: [{ sku: 'o1', quantity: 1, unitPrice: 1 }] });
    const o2 = await service.create({ customerId: 'c-1', items: [{ sku: 'o2', quantity: 1, unitPrice: 1 }] });
    const o3 = await service.create({ customerId: 'c-1', items: [{ sku: 'o3', quantity: 1, unitPrice: 1 }] });

    const first = (await service.list({ limit: '2' })) as CursorPage;
    expect(first.data.map(order => order.id)).toEqual([o1.id, o2.id]);

    const o4 = await service.create({ customerId: 'c-1', items: [{ sku: 'o4', quantity: 1, unitPrice: 1 }] });

    const second = (await service.list({ limit: '2', cursor: first.nextCursor! })) as CursorPage;
    expect(second.data.map(order => order.id)).toEqual([o3.id, o4.id]);
    expect(second.nextCursor).toBeNull();
  });

  it('omits a removed order without error, and a later status change skips only that order (UT-07)', async () => {
    const o1 = await service.create({ customerId: 'c-1', items: [{ sku: 'o1', quantity: 1, unitPrice: 1 }] });
    const o2 = await service.create({ customerId: 'c-1', items: [{ sku: 'o2', quantity: 1, unitPrice: 1 }] });
    const o3 = await service.create({ customerId: 'c-1', items: [{ sku: 'o3', quantity: 1, unitPrice: 1 }] });

    const first = (await service.list({ limit: '2' })) as CursorPage;
    expect(first.data.map(order => order.id)).toEqual([o1.id, o2.id]);

    repository.remove(o3.id);
    const afterRemoval = (await service.list({ cursor: first.nextCursor! })) as CursorPage;
    expect(afterRemoval).toEqual({ data: [], nextCursor: null });

    const p1 = await service.create({ customerId: 'c-2', items: [{ sku: 'p1', quantity: 1, unitPrice: 1 }] });
    const p2 = await service.create({ customerId: 'c-2', items: [{ sku: 'p2', quantity: 1, unitPrice: 1 }] });
    await service.create({ customerId: 'c-2', items: [{ sku: 'p3', quantity: 1, unitPrice: 1 }] });
    const p4 = await service.create({ customerId: 'c-2', items: [{ sku: 'p4', quantity: 1, unitPrice: 1 }] });
    repository.setStatus(p1.id, 'pending');
    repository.setStatus(p2.id, 'pending');
    repository.setStatus(p4.id, 'pending');

    const pendingFirst = (await service.list({ customerId: 'c-2', status: 'pending', limit: '1' })) as CursorPage;
    expect(pendingFirst.data.map(order => order.id)).toEqual([p1.id]);

    repository.setStatus(p2.id, 'paid');

    const pendingSecond = (await service.list({ customerId: 'c-2', status: 'pending', cursor: pendingFirst.nextCursor! })) as CursorPage;
    expect(pendingSecond.data.map(order => order.id)).toEqual([p4.id]);
    expect(pendingSecond.nextCursor).toBeNull();
  });

  it('rejects limit values outside 1-100 or non-integers with invalid_limit (UT-08)', async () => {
    for (const limit of ['0', '-5', '1.5', '101', 'abc']) {
      await expectBadRequest(() => service.list({ limit }), 'invalid_limit');
    }
  });

  it('rejects empty, malformed, tampered or foreign-secret cursors with invalid_cursor (UT-09)', async () => {
    const valid = encodeCursor({ createdAt: new Date().toISOString(), customerId: null, status: null }, API_KEY);
    const tampered = `x${valid.slice(1)}`;
    const foreignSecret = encodeCursor({ createdAt: new Date().toISOString(), customerId: null, status: null }, 'other-secret');

    await expectBadRequest(() => service.list({ cursor: '' }), 'invalid_cursor');
    await expectBadRequest(() => service.list({ cursor: 'garbage' }), 'invalid_cursor');
    await expectBadRequest(() => service.list({ cursor: tampered }), 'invalid_cursor');
    await expectBadRequest(() => service.list({ cursor: foreignSecret }), 'invalid_cursor');
  });

  it('rejects offset and cursor parameters combined with conflicting_pagination (UT-10)', async () => {
    await expectBadRequest(() => service.list({ page: 2, limit: '10' }), 'conflicting_pagination');
    await expectBadRequest(() => service.list({ pageSize: 50, cursor: 'anything' }), 'conflicting_pagination');
  });

  it('keeps the offset envelope, defaults and pageSize cap unchanged without cursor or limit (UT-11)', async () => {
    for (let i = 0; i < 3; i++) await service.create({ customerId: 'c-1', items: [{ sku: `s${i}`, quantity: 1, unitPrice: 1 }] });

    const noParams = (await service.list({})) as OffsetPage;
    expect(noParams.page).toBe(1);
    expect(noParams.pageSize).toBe(20);
    expect(noParams.total).toBe(3);

    const capped = (await service.list({ page: 2, pageSize: 500 })) as OffsetPage;
    expect(capped.page).toBe(2);
    expect(capped.pageSize).toBe(100);
    expect(capped.total).toBe(3);
  });
});
