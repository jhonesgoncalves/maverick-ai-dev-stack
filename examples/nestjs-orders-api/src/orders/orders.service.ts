import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { CacheService } from '../common/cache/cache.service';
import { CustomersService } from '../customers/customers.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { decodeCursor, encodeCursor } from './order-cursor';
import { Order } from './order.entity';
import { orderTotal } from './order-pricing';
import { OrdersRepository } from './orders.repository';

type OffsetOrdersPage = { data: Order[]; page: number; pageSize: number; total: number };
type CursorOrdersPage = { data: Order[]; nextCursor: string | null };

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

  async list(query: ListOrdersDto): Promise<OffsetOrdersPage | CursorOrdersPage> {
    const cursorMode = query.cursor !== undefined || query.limit !== undefined;
    if (cursorMode && (query.page !== undefined || query.pageSize !== undefined)) {
      throw new BadRequestException({ code: 'conflicting_pagination', message: 'page and pageSize cannot be combined with cursor or limit' });
    }
    return cursorMode ? this.listByCursor(query) : this.listByOffset(query);
  }

  private async listByOffset(query: ListOrdersDto): Promise<OffsetOrdersPage> {
    const max = this.config.get<number>('orders.maxPageSize', 100);
    const pageSize = Math.min(query.pageSize ?? this.config.get<number>('orders.defaultPageSize', 20), max);
    const page = query.page ?? 1;
    const key = `orders:${query.customerId ?? '*'}:${query.status ?? '*'}:${page}:${pageSize}`;
    return this.cache.wrap(key, 30, async () => {
      const rows = this.filterOrders(query);
      return { data: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length };
    });
  }

  private async listByCursor(query: ListOrdersDto): Promise<CursorOrdersPage> {
    const max = this.config.get<number>('orders.maxPageSize', 100);
    const defaultLimit = this.config.get<number>('orders.defaultPageSize', 20);
    const limit = this.parseLimit(query.limit, defaultLimit, max);
    const customerId = query.customerId ?? null;
    const status = query.status ?? null;

    let after: string | undefined;
    if (query.cursor !== undefined) {
      const payload = decodeCursor(query.cursor, this.apiKey());
      if (!payload || payload.customerId !== customerId || payload.status !== status) {
        throw new BadRequestException({ code: 'invalid_cursor', message: 'cursor is invalid' });
      }
      after = payload.createdAt;
    }

    const key = `orders:cursor:${customerId ?? '*'}:${status ?? '*'}:${query.cursor ?? '-'}:${limit}`;
    return this.cache.wrap(key, 30, async () => {
      const rows = this.filterOrders(query).filter(order => !after || order.createdAt > after);
      const window = rows.slice(0, limit + 1);
      const hasMore = window.length > limit;
      const data = hasMore ? window.slice(0, limit) : window;
      const nextCursor = hasMore
        ? encodeCursor({ createdAt: data[data.length - 1].createdAt, customerId, status }, this.apiKey())
        : null;
      return { data, nextCursor };
    });
  }

  private parseLimit(raw: string | undefined, defaultLimit: number, max: number): number {
    if (raw === undefined) return defaultLimit;
    const invalid = new BadRequestException({ code: 'invalid_limit', message: `limit must be an integer between 1 and ${max}` });
    if (!/^[0-9]+$/.test(raw)) throw invalid;
    const value = Number(raw);
    if (value < 1 || value > max) throw invalid;
    return value;
  }

  private filterOrders(query: ListOrdersDto): Order[] {
    return this.orders.all().filter(order => (!query.customerId || order.customerId === query.customerId) && (!query.status || order.status === query.status));
  }

  private apiKey(): string {
    return this.config.get<string>('apiKey', 'dev-api-key');
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
