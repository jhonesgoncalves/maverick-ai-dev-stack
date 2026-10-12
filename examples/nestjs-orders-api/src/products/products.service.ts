import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './product.entity';
import { ProductsRepository } from './products.repository';

export type ProductsPage = { data: Product[]; page: number; pageSize: number; total: number };

@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  create(input: CreateProductDto): Product {
    // Check and insert run in the same synchronous tick, so concurrent creates never share a sku.
    if (this.products.findBySku(input.sku)) {
      throw new ConflictException({ code: 'sku_conflict', message: `sku ${input.sku} already exists` });
    }
    return this.products.insert({ sku: input.sku, name: input.name, description: input.description, price: input.price });
  }

  list(query: ListProductsDto): ProductsPage {
    const { defaultPageSize, maxPageSize } = this.config.get('products', { infer: true });
    const pageSize = Math.min(query.pageSize ?? defaultPageSize, maxPageSize);
    const page = query.page ?? 1;
    const rows = this.products.all().filter((product) => query.includeInactive || product.active);
    return { data: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length };
  }

  get(id: string): Product {
    const product = this.products.find(id);
    if (!product) throw new NotFoundException(`product ${id} not found`);
    return product;
  }

  update(id: string, patch: UpdateProductDto): Product {
    const current = this.get(id);
    const changes: Partial<Pick<Product, 'name' | 'description' | 'price' | 'active'>> = {};
    if (patch.name !== undefined) changes.name = patch.name;
    if (patch.description !== undefined) changes.description = patch.description;
    if (patch.price !== undefined) changes.price = patch.price;
    if (patch.active !== undefined) changes.active = patch.active;
    if (Object.keys(changes).length === 0) return current;
    return this.products.update(id, changes) ?? current;
  }

  deactivate(id: string): void {
    if (this.get(id).active) this.update(id, { active: false });
  }
}
