import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Orders API (e2e)', () => {
  let app: INestApplication;
  const key = { 'x-api-key': 'dev-api-key' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: ['health'] });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /health is public', () => request(app.getHttpServer()).get('/health').expect(200));

  it('rejects requests without an api key', () => request(app.getHttpServer()).get('/api/v1/orders').expect(401));

  it('creates and lists orders', async () => {
    const created = await request(app.getHttpServer()).post('/api/v1/orders').set(key).send({ customerId: 'c-1', items: [{ sku: 'mug', quantity: 2, unitPrice: 12.5 }] }).expect(201);
    expect(created.body.total).toBe(25);
    const list = await request(app.getHttpServer()).get('/api/v1/orders').set(key).expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(1);
  });

  it('validates the payload', () => request(app.getHttpServer()).post('/api/v1/orders').set(key).send({ customerId: 'c-1', items: [] }).expect(400));
});
