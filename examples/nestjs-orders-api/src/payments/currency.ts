// Known import cycle with orders/order-pricing.ts — `maverick graph` and `maverick audit` report it.
import { DEFAULT_CURRENCY } from '../orders/order-pricing';

export const roundToCents = (amount: number): number => Math.round(amount * 100) / 100;

export const formatMoney = (amount: number, currency: string = DEFAULT_CURRENCY): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency.toUpperCase() }).format(amount);
