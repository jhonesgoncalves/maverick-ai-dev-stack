import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

interface PaymentWebhook {
  type: string;
  data: { orderId: string; paymentId: string };
}

// Signature verification is intentionally missing: `maverick audit` flags this route.
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly events: EventEmitter2) {}

  @Post('payments')
  @HttpCode(200)
  handle(@Body() body: PaymentWebhook) {
    if (body.type === 'payment.succeeded') this.events.emit('payment.confirmed', { orderId: body.data.orderId });
    return { received: true };
  }
}
