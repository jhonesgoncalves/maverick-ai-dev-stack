import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from './common/cache/cache.module';
import configuration from './config/configuration';
import { CustomersModule } from './customers/customers.module';
import { HealthController } from './health/health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ProductsModule } from './products/products.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    CacheModule,
    CustomersModule,
    OrdersModule,
    ProductsModule,
    PaymentsModule,
    NotificationsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
