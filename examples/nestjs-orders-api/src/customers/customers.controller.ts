import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { CustomersService } from './customers.service';

class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
}

@Controller('customers')
@UseGuards(ApiKeyGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list() {
    return this.customers.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCustomerDto) {
    return this.customers.update(id, body);
  }
}
