import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { Order } from '../orders/order.entity';
import { DEFAULT_CURRENCY, orderTotal } from '../orders/order-pricing';
import { formatMoney } from './currency';

export interface Charge {
  id: string;
  status: 'succeeded' | 'requires_action' | 'failed';
  amount: number;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async charge(order: Order): Promise<Charge> {
    const amount = orderTotal(order);
    if (this.config.get('payments.mode') !== 'http') {
      this.logger.log(`fake charge of ${formatMoney(amount)} for order ${order.id}`);
      return { id: `pay_${randomUUID()}`, status: 'succeeded', amount };
    }
    const baseUrl = this.config.get<string>('payments.baseUrl');
    const response = await firstValueFrom(this.http.post<Charge>(`${baseUrl}/charges`, { amount, currency: DEFAULT_CURRENCY, metadata: { orderId: order.id } }));
    return response.data;
  }

  async refund(paymentId: string): Promise<void> {
    if (this.config.get('payments.mode') !== 'http') return void this.logger.log(`fake refund of ${paymentId}`);
    await firstValueFrom(this.http.post(`${this.config.get<string>('payments.baseUrl')}/refunds`, { paymentId }));
  }
}
