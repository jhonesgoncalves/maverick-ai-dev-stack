import { roundToCents } from '../payments/currency';
import { Order } from './order.entity';

export const DEFAULT_CURRENCY = 'brl';

export const orderTotal = (order: Pick<Order, 'items'>): number =>
  roundToCents(order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
