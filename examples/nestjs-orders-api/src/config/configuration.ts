export interface AppConfig {
  apiKey: string;
  redisUrl?: string;
  payments: { mode: 'fake' | 'http'; baseUrl: string };
  orders: { defaultPageSize: number; maxPageSize: number };
  products: { defaultPageSize: number; maxPageSize: number };
}

export default (): AppConfig => ({
  apiKey: process.env.API_KEY || 'dev-api-key',
  redisUrl: process.env.REDIS_URL || undefined,
  payments: {
    mode: process.env.PAYMENTS_MODE === 'http' ? 'http' : 'fake',
    baseUrl: process.env.PAYMENTS_BASE_URL || 'https://payments.example.test/v1',
  },
  orders: { defaultPageSize: 20, maxPageSize: 100 },
  products: { defaultPageSize: 20, maxPageSize: 100 },
});
