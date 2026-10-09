import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

export class CreateOrderItemDto {
  @IsString() sku: string;
  @IsInt() @Min(1) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
}

export class CreateOrderDto {
  @IsString() customerId: string;

  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
