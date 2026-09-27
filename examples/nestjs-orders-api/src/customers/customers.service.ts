import { Injectable, NotFoundException } from '@nestjs/common';
import { Customer } from './customer.entity';
import { CustomersRepository } from './customers.repository';

@Injectable()
export class CustomersService {
  constructor(private readonly customers: CustomersRepository) {}

  list(): Customer[] {
    return this.customers.all();
  }

  get(id: string): Customer {
    const customer = this.customers.find(id);
    if (!customer) throw new NotFoundException(`customer ${id} not found`);
    return customer;
  }

  update(id: string, patch: { name?: string; email?: string }): Customer {
    const customer = this.customers.update(id, patch);
    if (!customer) throw new NotFoundException(`customer ${id} not found`);
    return customer;
  }
}
