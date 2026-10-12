import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateProductDto {
  @IsString() @MaxLength(64) @Matches(/^\S(.*\S)?$/) sku!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price!: number;
}
