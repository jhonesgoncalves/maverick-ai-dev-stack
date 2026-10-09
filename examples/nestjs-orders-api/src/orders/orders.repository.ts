import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Order, OrderItem, OrderStatus } from './order.entity';

@Injectable()
export class OrdersRepository {
  private readonly rows = new Map<string, Order>();
  private lastCreatedAt = 0;

  insert(input: { customerId: string; items: OrderItem[] }): Order {
    // createdAt is strictly increasing, so it is a stable sort key even within one millisecond.
    this.lastCreatedAt = Math.max(Date.now(), this.lastCreatedAt + 1);
    const order: Order = { id: randomUUID(), customerId: input.customerId, items: input.items, status: 'pending', createdAt: new Date(this.lastCreatedAt).toISOString() };
    this.rows.set(order.id, order);
    return order;
  }

  find(id: string): Order | undefined {
    return this.rows.get(id);
  }

  all(): Order[] {
    return [...this.rows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  update(id: string, patch: Partial<Order>): Order | undefined {
    const current = this.rows.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch, id };
    this.rows.set(id, next);
    return next;
  }

  setStatus(id: string, status: OrderStatus): Order | undefined {
    return this.update(id, { status });
  }

  remove(id: string): boolean {
    return this.rows.delete(id);
  }
}
