import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdersRepository } from '../orders/orders.repository';
import { orderTotal } from '../orders/order-pricing';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly orders: OrdersRepository) {}

  dailySummary() {
    const paid = this.orders.all().filter(order => order.status === 'paid');
    return { orders: paid.length, revenue: paid.reduce((sum, order) => sum + orderTotal(order), 0) };
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  logDailySummary() {
    const summary = this.dailySummary();
    this.logger.log(`daily summary: ${summary.orders} paid orders, revenue ${summary.revenue}`);
  }
}
