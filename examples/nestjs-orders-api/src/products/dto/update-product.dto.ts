import { Equals, IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @Equals(undefined, { message: 'sku cannot be changed' }) sku?: never;
  @Equals(undefined, { message: 'id cannot be changed' }) id?: never;
}
