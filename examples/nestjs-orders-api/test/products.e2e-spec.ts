import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

type Row = { id: string; active: boolean };

describe('Products API (e2e)', () => {
  let app: INestApplication;
  const key = { 'x-api-key': 'dev-api-key' };
  const base = '/api/v1/products';
  const missing = '00000000-0000-4000-8000-000000000000';
  let n = 0;
  const http = () => request(app.getHttpServer());
  const sku = () => 'SKU-' + Date.now() + '-' + n++;
  const at = (id: string) => base + '/' + id;
  const create = async (extra: Record<string, unknown> = {}) =>
    (await http().post(base).set(key).send({ sku: sku(), name: 'Mug', price: 10, ...extra }).expect(201)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('lists an empty catalog first', async () => {
    const res = await http().get(base).set(key).expect(200);
    expect(res.body).toEqual({ data: [], page: 1, pageSize: 20, total: 0 });
  });

  it('IT-01 creates products, accepting 19.9 and 10.99', async () => {
    const a = await create({ price: 19.9 });
    expect(a).toMatchObject({ active: true, price: 19.9 });
    expect(a.id).toBeDefined();
    expect(a.createdAt).toBeDefined();
    expect(a.updatedAt).toBeDefined();
    await create({ price: 10.99, description: 'x' });
    await create({ price: 0 });
  });

  it('IT-02 rejects duplicate sku, active or deactivated, and concurrent creates', async () => {
    const p = await create();
    const dup = await http().post(base).set(key).send({ sku: p.sku, name: 'x', price: 1 }).expect(409);
    expect(dup.body.code).toBe('sku_conflict');
    await http().delete(at(p.id)).set(key).expect(204);
    const dup2 = await http().post(base).set(key).send({ sku: p.sku, name: 'x', price: 1 }).expect(409);
    expect(dup2.body.code).toBe('sku_conflict');
    const s = sku();
    const results = await Promise.all([1, 2].map(() => http().post(base).set(key).send({ sku: s, name: 'x', price: 1 })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('IT-03 validates the create payload', async () => {
    const bad = sku();
    const bodies = [
      { sku: bad, name: 'x', price: -1 },
      { sku: bad, name: 'x', price: 10.999 },
      { sku: bad, price: 1 },
      { sku: '', name: 'x', price: 1 },
      { sku: ' ' + bad, name: 'x', price: 1 },
      { sku: bad, name: 'x', price: '5' },
    ];
    for (const body of bodies) await http().post(base).set(key).send(body).expect(400);
    const list = await http().get(base + '?includeInactive=true&pageSize=100').set(key).expect(200);
    expect(list.body.data.some((p: { sku: string }) => p.sku.trim() === bad)).toBe(false);
  });

  it('IT-04 gets a product, even inactive', async () => {
    const p = await create();
    expect((await http().get(at(p.id)).set(key).expect(200)).body.id).toBe(p.id);
    await http().delete(at(p.id)).set(key).expect(204);
    expect((await http().get(at(p.id)).set(key).expect(200)).body.active).toBe(false);
  });

  it('IT-05 returns 404 for unknown ids', async () => {
    await http().get(at(missing)).set(key).expect(404);
    await http().patch(at(missing)).set(key).send({ name: 'x' }).expect(404);
    await http().delete(at(missing)).set(key).expect(404);
  });

  it('IT-06 lists with pagination and includeInactive', async () => {
    const list = (q: string) => http().get(base + q).set(key);
    await create();
    await create();
    await create();
    const all = (await list('?pageSize=100').expect(200)).body;
    expect(all.page).toBe(1);
    expect(all.pageSize).toBe(100);
    const ids = (rows: Row[]) => rows.map((p) => p.id);
    const first = (await list('?pageSize=2').expect(200)).body;
    expect(first.data).toHaveLength(2);
    expect(first.total).toBe(all.total);
    expect(ids(first.data)).toEqual(ids(all.data.slice(0, 2)));
    const second = (await list('?page=2&pageSize=2').expect(200)).body;
    expect(ids(second.data)).toEqual(ids(all.data.slice(2, 4)));
    const beyond = (await list('?page=9999').expect(200)).body;
    expect(beyond.data).toEqual([]);
    expect(beyond.total).toBe(all.total);
    expect((await list('?pageSize=500').expect(200)).body.pageSize).toBe(100);
    const off = await create();
    await http().delete(at(off.id)).set(key).expect(204);
    const active = (await list('?pageSize=100').expect(200)).body;
    expect(ids(active.data)).not.toContain(off.id);
    const incl = (await list('?includeInactive=true&pageSize=100').expect(200)).body;
    expect(ids(incl.data)).toContain(off.id);
    expect(incl.total).toBeGreaterThan(active.total);
    await list('?page=0').expect(400);
    await list('?pageSize=0').expect(400);
    await list('?pageSize=abc').expect(400);
    await list('?includeInactive=maybe').expect(400);
  });

  it('IT-07 patches fields and reactivates', async () => {
    const p = await create();
    const res = await http().patch(at(p.id)).set(key).send({ price: 19.9, name: 'New', description: 'd' }).expect(200);
    expect(res.body).toMatchObject({ price: 19.9, name: 'New', description: 'd', sku: p.sku, active: true });
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(new Date(p.updatedAt).getTime());
    await http().delete(at(p.id)).set(key).expect(204);
    const re = await http().patch(at(p.id)).set(key).send({ active: true }).expect(200);
    expect(re.body.active).toBe(true);
    const list = (await http().get(base + '?pageSize=100').set(key).expect(200)).body;
    expect(list.data.map((x: Row) => x.id)).toContain(p.id);
  });

  it('IT-07 empty patch keeps the product and updatedAt; non-boolean active is 400', async () => {
    const p = await create();
    const res = await http().patch(at(p.id)).set(key).send({}).expect(200);
    expect(res.body).toEqual(p);
    await http().patch(at(p.id)).set(key).send({ active: 'yes' }).expect(400);
  });

  it('IT-08 rejects sku and id in patch', async () => {
    const p = await create();
    for (const body of [{ sku: 'other' }, { id: missing }, { sku: null }, { id: null }]) {
      await http().patch(at(p.id)).set(key).send(body).expect(400);
    }
    expect((await http().get(at(p.id)).set(key).expect(200)).body).toEqual(p);
  });

  it('IT-09 deactivates idempotently', async () => {
    const p = await create();
    await http().delete(at(p.id)).set(key).expect(204);
    await http().delete(at(p.id)).set(key).expect(204);
    expect((await http().get(at(p.id)).set(key).expect(200)).body.active).toBe(false);
  });

  it('IT-10 requires a valid api key on all routes', async () => {
    const id = at(missing);
    for (const headers of [{}, { 'x-api-key': 'wrong' }]) {
      await http().post(base).set(headers).send({ sku: sku(), name: 'x', price: 1 }).expect(401);
      await http().get(base).set(headers).expect(401);
      await http().get(id).set(headers).expect(401);
      await http().patch(id).set(headers).send({}).expect(401);
      await http().delete(id).set(headers).expect(401);
    }
  });

  it('IT-12 rejects malformed ids with 400', async () => {
    await http().get(at('abc')).set(key).expect(400);
    await http().patch(at('abc')).set(key).send({}).expect(400);
    await http().delete(at('abc')).set(key).expect(400);
  });
});
