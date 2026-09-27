import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { CacheService } from '../common/cache/cache.service';
import { CustomersService } from '../customers/customers.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { Order } from './order.entity';
import { orderTotal } from './order-pricing';
import { OrdersRepository } from './orders.repository';

@Injectable()
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly customers: CustomersService,
    private readonly payments: PaymentsService,
    private readonly cache: CacheService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  // TODO: replace offset pagination with cursor pagination (see docs/decisions/adr-001).
  async list(query: ListOrdersDto) {
    const max = this.config.get<number>('orders.maxPageSize', 100);
    const pageSize = Math.min(query.pageSize ?? this.config.get<number>('orders.defaultPageSize', 20), max);
    const page = query.page ?? 1;
    const key = `orders:${query.customerId ?? '*'}:${query.status ?? '*'}:${page}:${pageSize}`;
    return this.cache.wrap(key, 30, async () => {
      const rows = this.orders.all().filter(order => (!query.customerId || order.customerId === query.customerId) && (!query.status || order.status === query.status));
      return { data: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length };
    });
  }

  get(id: string): Order {
    const order = this.orders.find(id);
    if (!order) throw new NotFoundException(`order ${id} not found`);
    return order;
  }

  async create(input: CreateOrderDto): Promise<Order & { total: number }> {
    this.customers.get(input.customerId);
    const order = this.orders.insert(input);
    const charge = await this.payments.charge(order);
    const saved = this.orders.update(order.id, { paymentId: charge.id, status: charge.status === 'succeeded' ? 'paid' : 'pending' })!;
    await this.cache.invalidate('orders:');
    this.events.emit('order.created', { orderId: saved.id, customerId: saved.customerId, total: orderTotal(saved) });
    return { ...saved, total: orderTotal(saved) };
  }

  async cancel(id: string): Promise<void> {
    const order = this.get(id);
    if (order.status === 'paid' && order.paymentId) await this.payments.refund(order.paymentId);
    this.orders.setStatus(id, 'cancelled');
    await this.cache.invalidate('orders:');
    this.events.emit('order.cancelled', { orderId: id, customerId: order.customerId });
  }

  // FIXME: builds the whole CSV in memory; stream it once orders move to a real database.
  exportCsv(): string {
    const header = 'id,customerId,status,total,createdAt';
    return [header, ...this.orders.all().map(order => [order.id, order.customerId, order.status, orderTotal(order), order.createdAt].join(','))].join('\n');
  }

  @OnEvent('payment.confirmed')
  async markPaid(event: { orderId: string }): Promise<void> {
    if (this.orders.setStatus(event.orderId, 'paid')) await this.cache.invalidate('orders:');
  }
}
