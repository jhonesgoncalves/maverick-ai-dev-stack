import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [HttpModule.register({ timeout: 5000 })],
  controllers: [WebhooksController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
