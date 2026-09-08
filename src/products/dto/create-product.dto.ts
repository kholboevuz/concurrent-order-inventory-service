import {
    IsInt,
    IsNotEmpty,
    IsNumber,
    IsPositive,
    IsString,
    MaxLength,
    Min,
} from 'class-validator';

export class CreateProductDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    name: string;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    price: number;

    @IsInt()
    @IsPositive()
    stockQuantity: number;
}