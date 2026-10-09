export type OrderStatus = 'pending' | 'paid' | 'cancelled';

export interface OrderItem {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  customerId: string;
  items: OrderItem[];
  status: OrderStatus;
  paymentId?: string;
  createdAt: string;
}
