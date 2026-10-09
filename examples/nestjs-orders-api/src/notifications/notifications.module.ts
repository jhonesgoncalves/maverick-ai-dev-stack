import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { NotificationsListener } from './notifications.listener';

@Module({ imports: [CustomersModule], providers: [NotificationsListener], exports: [NotificationsListener] })
export class NotificationsModule {}
