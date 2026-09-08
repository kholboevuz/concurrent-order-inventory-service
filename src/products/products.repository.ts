import { Injectable } from '@nestjs/common';

import { CreateProductDto } from './dto/create-product.dto.js';
import { DatabaseService } from '../database/database.service.js';

export interface Product {
    id: string;
    name: string;
    price: string;
    stock_quantity: number;
    created_at: Date;
    updated_at: Date;
}

@Injectable()
export class ProductsRepository {
    constructor(private readonly database: DatabaseService) { }

    async create(dto: CreateProductDto): Promise<Product> {
        const result = await this.database.query<Product>(
            `
      INSERT INTO products (
        name,
        price,
        stock_quantity
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        name,
        price,
        stock_quantity,
        created_at,
        updated_at
      `,
            [dto.name, dto.price, dto.stockQuantity],
        );

        return result.rows[0];
    }

    async findById(id: string): Promise<Product | null> {
        const result = await this.database.query<Product>(
            `
      SELECT
        id,
        name,
        price,
        stock_quantity,
        created_at,
        updated_at
      FROM products
      WHERE id = $1
      `,
            [id],
        );

        return result.rows[0] ?? null;
    }

    async findAll(): Promise<Product[]> {
        const result = await this.database.query<Product>(
            `
      SELECT
        id,
        name,
        price,
        stock_quantity,
        created_at,
        updated_at
      FROM products
      ORDER BY created_at DESC
      `,
        );

        return result.rows;
    }
}