import {
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

interface ProductRow {
    id: string;
    name: string;
    price: string;
    stock_quantity: number;
}

interface ExistingIdempotencyRow {
    order_id: string;
}

@Injectable()
export class OrdersRepository {
    constructor(private readonly database: DatabaseService) { }

    async create(
        userId: string,
        idempotencyKey: string,
        dto: CreateOrderDto,
    ) {
        const client = await this.database.getClient();

        try {
            await client.query('BEGIN');

            const existingKey = await client.query<ExistingIdempotencyRow>(
                `
        SELECT order_id
        FROM idempotency_keys
        WHERE user_id = $1
          AND key = $2
        FOR UPDATE
        `,
                [userId, idempotencyKey],
            );

            if (existingKey.rows.length > 0) {
                await client.query('COMMIT');

                return this.findById(existingKey.rows[0].order_id, userId);
            }

            const aggregatedItems = new Map<string, number>();

            for (const item of dto.items) {
                const current = aggregatedItems.get(item.productId) ?? 0;
                aggregatedItems.set(item.productId, current + item.quantity);
            }

            const productIds = [...aggregatedItems.keys()].sort();

            const products: ProductRow[] = [];

            for (const productId of productIds) {
                const result = await client.query<ProductRow>(
                    `
          SELECT
            id,
            name,
            price,
            stock_quantity
          FROM products
          WHERE id = $1
          FOR UPDATE
          `,
                    [productId],
                );

                if (result.rows.length === 0) {
                    throw new NotFoundException(
                        `Product ${productId} not found`,
                    );
                }

                products.push(result.rows[0]);
            }

            for (const product of products) {
                const requestedQuantity =
                    aggregatedItems.get(product.id)!;

                if (product.stock_quantity < requestedQuantity) {
                    throw new ConflictException(
                        `Insufficient stock for product ${product.id}`,
                    );
                }
            }

            let totalAmount = 0;

            for (const product of products) {
                const quantity = aggregatedItems.get(product.id)!;

                totalAmount += Number(product.price) * quantity;

                await client.query(
                    `
          UPDATE products
          SET
            stock_quantity = stock_quantity - $1,
            updated_at = NOW()
          WHERE id = $2
          `,
                    [quantity, product.id],
                );
            }

            const orderResult = await client.query<{
                id: string;
                status: string;
                total_amount: string;
                expires_at: Date;
                created_at: Date;
                updated_at: Date;
            }>(
                `
        INSERT INTO orders (
          user_id,
          status,
          total_amount,
          expires_at
        )
        VALUES (
          $1,
          'pending',
          $2,
          NOW() + INTERVAL '15 minutes'
        )
        RETURNING
          id,
          status,
          total_amount,
          expires_at,
          created_at,
          updated_at
        `,
                [userId, totalAmount],
            );

            const order = orderResult.rows[0];


            for (const product of products) {
                const quantity = aggregatedItems.get(product.id)!;

                await client.query(
                    `
          INSERT INTO order_items (
            order_id,
            product_id,
            quantity,
            price
          )
          VALUES ($1, $2, $3, $4)
          `,
                    [
                        order.id,
                        product.id,
                        quantity,
                        product.price,
                    ],
                );
            }

            try {
                await client.query(
                    `
          INSERT INTO idempotency_keys (
            user_id,
            key,
            order_id
          )
          VALUES ($1, $2, $3)
          `,
                    [userId, idempotencyKey, order.id],
                );
            } catch (error: any) {

                if (error.code === '23505') {
                    await client.query('ROLLBACK');

                    return this.findByIdempotencyKey(
                        userId,
                        idempotencyKey,
                    );
                }

                throw error;
            }

            await client.query('COMMIT');

            return this.findById(order.id, userId);
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch { }

            throw error;
        } finally {
            client.release();
        }
    }

    private async findByIdempotencyKey(
        userId: string,
        key: string,
    ) {
        const result = await this.database.query<ExistingIdempotencyRow>(
            `
      SELECT order_id
      FROM idempotency_keys
      WHERE user_id = $1
        AND key = $2
      `,
            [userId, key],
        );

        if (result.rows.length === 0) {
            throw new ConflictException(
                'Idempotency key conflict',
            );
        }

        return this.findById(
            result.rows[0].order_id,
            userId,
        );
    }

    async findById(orderId: string, userId: string) {
        const orderResult = await this.database.query<{
            id: string;
            status: string;
            total_amount: string;
            expires_at: Date;
            created_at: Date;
            updated_at: Date;
        }>(
            `
      SELECT
        id,
        status,
        total_amount,
        expires_at,
        created_at,
        updated_at
      FROM orders
      WHERE id = $1
        AND user_id = $2
      `,
            [orderId, userId],
        );

        if (orderResult.rows.length === 0) {
            throw new NotFoundException('Order not found');
        }

        const order = orderResult.rows[0];

        const itemsResult = await this.database.query<{
            product_id: string;
            quantity: number;
            price: string;
        }>(
            `
      SELECT
        product_id,
        quantity,
        price
      FROM order_items
      WHERE order_id = $1
      ORDER BY id
      `,
            [orderId],
        );

        return {
            id: order.id,
            status: order.status,
            totalAmount: Number(order.total_amount),
            expiresAt: order.expires_at,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
            items: itemsResult.rows.map((item) => ({
                productId: item.product_id,
                quantity: item.quantity,
                price: Number(item.price),
            })),
        };
    }

    async cancel(orderId: string, userId: string) {
        const client = await this.database.getClient();

        try {
            await client.query('BEGIN');

            const orderResult = await client.query<{
                id: string;
                status: string;
            }>(
                `
      SELECT id, status
      FROM orders
      WHERE id = $1
        AND user_id = $2
      FOR UPDATE
      `,
                [orderId, userId],
            );

            if (orderResult.rows.length === 0) {
                throw new NotFoundException('Order not found');
            }

            const order = orderResult.rows[0];

            if (order.status !== 'pending') {
                throw new ConflictException(
                    `Order cannot be cancelled because its status is ${order.status}`,
                );
            }

            const itemsResult = await client.query<{
                product_id: string;
                quantity: number;
            }>(
                `
      SELECT product_id, quantity
      FROM order_items
      WHERE order_id = $1
      `,
                [orderId],
            );

            const sortedItems = [...itemsResult.rows].sort(
                (a, b) => a.product_id.localeCompare(b.product_id),
            );

            for (const item of sortedItems) {
                const productResult = await client.query(
                    `
        SELECT id
        FROM products
        WHERE id = $1
        FOR UPDATE
        `,
                    [item.product_id],
                );

                if (productResult.rows.length === 0) {
                    throw new NotFoundException(
                        `Product ${item.product_id} not found`,
                    );
                }

                await client.query(
                    `
        UPDATE products
        SET
          stock_quantity = stock_quantity + $1,
          updated_at = NOW()
        WHERE id = $2
        `,
                    [item.quantity, item.product_id],
                );
            }

            await client.query(
                `
      UPDATE orders
      SET
        status = 'cancelled',
        updated_at = NOW()
      WHERE id = $1
      `,
                [orderId],
            );

            await client.query('COMMIT');

            return this.findById(orderId, userId);
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch { }

            throw error;
        } finally {
            client.release();
        }
    }

    async confirm(orderId: string, userId: string) {
        const client = await this.database.getClient();

        try {
            await client.query('BEGIN');

            const result = await client.query<{
                id: string;
                status: string;
            }>(
                `
      SELECT id, status
      FROM orders
      WHERE id = $1
        AND user_id = $2
      FOR UPDATE
      `,
                [orderId, userId],
            );

            if (result.rows.length === 0) {
                throw new NotFoundException('Order not found');
            }

            const order = result.rows[0];

            if (order.status !== 'pending') {
                throw new ConflictException(
                    `Order cannot be confirmed because its status is ${order.status}`,
                );
            }

            await client.query(
                `
      UPDATE orders
      SET
        status = 'confirmed',
        updated_at = NOW()
      WHERE id = $1
      `,
                [orderId],
            );

            await client.query('COMMIT');

            return this.findById(orderId, userId);
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch { }

            throw error;
        } finally {
            client.release();
        }
    }
}