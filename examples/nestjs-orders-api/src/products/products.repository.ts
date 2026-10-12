import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Product } from './product.entity';

@Injectable()
export class ProductsRepository {
  private readonly rows = new Map<string, Product>();
  private readonly idsBySku = new Map<string, string>();
  private lastTick = 0;

  // Strictly increasing clock: stable sort key and an updatedAt that always moves forward.
  private now(): string {
    this.lastTick = Math.max(Date.now(), this.lastTick + 1);
    return new Date(this.lastTick).toISOString();
  }

  insert(input: { sku: string; name: string; description?: string; price: number }): Product {
    const at = this.now();
    const product: Product = { id: randomUUID(), sku: input.sku, name: input.name, description: input.description, price: input.price, active: true, createdAt: at, updatedAt: at };
    this.rows.set(product.id, product);
    this.idsBySku.set(product.sku, product.id);
    return product;
  }

  find(id: string): Product | undefined {
    return this.rows.get(id);
  }

  findBySku(sku: string): Product | undefined {
    const id = this.idsBySku.get(sku);
    return id ? this.rows.get(id) : undefined;
  }

  all(): Product[] {
    return [...this.rows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  update(id: string, patch: Partial<Pick<Product, 'name' | 'description' | 'price' | 'active'>>): Product | undefined {
    const current = this.rows.get(id);
    if (!current) return undefined;
    const next: Product = { ...current, ...patch, id, sku: current.sku, updatedAt: this.now() };
    this.rows.set(id, next);
    return next;
  }
}
