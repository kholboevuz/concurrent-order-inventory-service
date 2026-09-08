import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class OrderExpirationWorker {
    private readonly logger = new Logger(
        OrderExpirationWorker.name,
    );

    constructor(
        private readonly database: DatabaseService,
        private readonly redis: RedisService,
    ) { }

    @Cron('*/30 * * * * *')
    async handleExpiredOrders() {
        const client = await this.database.getClient();

        try {
            await client.query('BEGIN');

            const affectedProductIds = new Set<string>();

            const ordersResult = await client.query<{
                id: string;
            }>(
                `
                SELECT id
                FROM orders
                WHERE status = 'pending'
                  AND expires_at <= NOW()
                ORDER BY expires_at
                LIMIT 100
                FOR UPDATE SKIP LOCKED
                `,
            );

            for (const order of ordersResult.rows) {
                const itemsResult = await client.query<{
                    product_id: string;
                    quantity: number;
                }>(
                    `
                    SELECT product_id, quantity
                    FROM order_items
                    WHERE order_id = $1
                    `,
                    [order.id],
                );

                const sortedItems = [...itemsResult.rows].sort(
                    (a, b) =>
                        a.product_id.localeCompare(b.product_id),
                );

                for (const item of sortedItems) {
                    affectedProductIds.add(item.product_id);

                    await client.query(
                        `
                        SELECT id
                        FROM products
                        WHERE id = $1
                        FOR UPDATE
                        `,
                        [item.product_id],
                    );

                    await client.query(
                        `
                        UPDATE products
                        SET
                            stock_quantity = stock_quantity + $1,
                            updated_at = NOW()
                        WHERE id = $2
                        `,
                        [
                            item.quantity,
                            item.product_id,
                        ],
                    );
                }

                await client.query(
                    `
                    UPDATE orders
                    SET
                        status = 'cancelled',
                        updated_at = NOW()
                    WHERE id = $1
                      AND status = 'pending'
                    `,
                    [order.id],
                );

                this.logger.log(
                    `Expired order cancelled: ${order.id}`,
                );
            }

            await client.query('COMMIT');

            if (affectedProductIds.size > 0) {
                await Promise.all(
                    [...affectedProductIds].map(
                        (productId) =>
                            this.redis.del(
                                `product:${productId}`,
                            ),
                    ),
                );

                this.logger.log(
                    `Invalidated ${affectedProductIds.size} product cache(s)`,
                );
            }

            if (ordersResult.rows.length > 0) {
                this.logger.log(
                    `Processed ${ordersResult.rows.length} expired order(s)`,
                );
            }
        } catch (error) {
            try {
                await client.query('ROLLBACK');
            } catch {

            }

            this.logger.error(
                'Failed to process expired orders',
                error,
            );
        } finally {
            client.release();
        }
    }
}