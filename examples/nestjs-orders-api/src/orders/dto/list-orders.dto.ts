import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { OrderStatus } from '../order.entity';

export class ListOrdersDto {
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsIn(['pending', 'paid', 'cancelled']) status?: OrderStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @IsString() limit?: string;
}
