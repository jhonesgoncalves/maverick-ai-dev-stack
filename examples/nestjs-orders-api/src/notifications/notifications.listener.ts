import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CustomersService } from '../customers/customers.service';

@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger(NotificationsListener.name);
  readonly sent: { to: string; template: string }[] = [];

  constructor(private readonly customers: CustomersService) {}

  @OnEvent('order.created')
  orderCreated(event: { orderId: string; customerId: string; total: number }) {
    this.send(event.customerId, `order-created:${event.orderId}:${event.total}`);
  }

  @OnEvent('order.cancelled')
  orderCancelled(event: { orderId: string; customerId: string }) {
    this.send(event.customerId, `order-cancelled:${event.orderId}`);
  }

  private send(customerId: string, template: string) {
    const customer = this.customers.get(customerId);
    this.sent.push({ to: customer.email, template });
    this.logger.log(`email ${template} -> ${customer.email}`);
  }
}
