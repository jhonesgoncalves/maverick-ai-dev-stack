import { Injectable } from '@nestjs/common';
import { Customer } from './customer.entity';

const SEED: Customer[] = [
  { id: 'c-1', name: 'Ada Rivera', email: 'ada@example.test', createdAt: '2026-08-01T10:00:00.000Z' },
  { id: 'c-2', name: 'Kenji Sato', email: 'kenji@example.test', createdAt: '2026-08-03T10:00:00.000Z' },
];

@Injectable()
export class CustomersRepository {
  private readonly rows = new Map(SEED.map(customer => [customer.id, { ...customer }]));

  find(id: string): Customer | undefined {
    return this.rows.get(id);
  }

  all(): Customer[] {
    return [...this.rows.values()];
  }

  update(id: string, patch: Partial<Omit<Customer, 'id'>>): Customer | undefined {
    const current = this.rows.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    this.rows.set(id, next);
    return next;
  }
}
