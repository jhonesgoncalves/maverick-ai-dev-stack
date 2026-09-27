import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(ApiKeyGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: ListOrdersDto) {
    return this.orders.list(query);
  }

  @Get('export')
  @Header('content-type', 'text/csv')
  export() {
    return this.orders.exportCsv();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(id);
  }

  @Post()
  create(@Body() body: CreateOrderDto) {
    return this.orders.create(body);
  }

  @Delete(':id')
  @HttpCode(204)
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel(id);
  }
}
