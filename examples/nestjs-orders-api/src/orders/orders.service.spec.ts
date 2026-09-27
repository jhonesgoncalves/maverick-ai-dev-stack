import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { CacheService } from '../common/cache/cache.service';
import configuration from '../config/configuration';
import { CustomersRepository } from '../customers/customers.repository';
import { CustomersService } from '../customers/customers.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersRepository } from './orders.repository';
import { orderTotal } from './order-pricing';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;
  let events: EventEmitter2;
  const payments = { charge: jest.fn(async () => ({ id: 'pay_1', status: 'succeeded', amount: 0 })), refund: jest.fn(async () => undefined) };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ load: [configuration] }), EventEmitterModule.forRoot()],
      providers: [OrdersService, OrdersRepository, CustomersService, CustomersRepository, CacheService, { provide: PaymentsService, useValue: payments }],
    }).compile();
    service = moduleRef.get(OrdersService);
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
    const page = await service.list({ customerId: 'c-1', page: 1, pageSize: 2 });
    expect(page.total).toBe(3);
    expect(page.data).toHaveLength(2);
  });

  it('refunds paid orders on cancel', async () => {
    const order = await service.create({ customerId: 'c-1', items: [{ sku: 'x', quantity: 1, unitPrice: 5 }] });
    await service.cancel(order.id);
    expect(payments.refund).toHaveBeenCalledWith('pay_1');
    expect(service.get(order.id).status).toBe('cancelled');
  });
});
