import { Injectable } from '@nestjs/common';
import { OrdersRepository } from './orders.repository.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class OrdersService {
    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly redis: RedisService,
    ) { }

    async create(
        userId: string,
        idempotencyKey: string,
        dto: CreateOrderDto,
    ) {
        const order = await this.ordersRepository.create(
            userId,
            idempotencyKey,
            dto,
        );

        const productIds = [
            ...new Set(dto.items.map((item) => item.productId)),
        ];

        await this.invalidateProductCaches(productIds);

        return order;
    }

    async findById(
        orderId: string,
        userId: string,
    ) {
        return this.ordersRepository.findById(
            orderId,
            userId,
        );
    }

    async cancel(
        orderId: string,
        userId: string,
    ) {
        const order = await this.ordersRepository.cancel(
            orderId,
            userId,
        );

        if (order?.items) {
            const productIds = [
                ...new Set(
                    order.items.map((item) => item.productId),
                ),
            ];

            await this.invalidateProductCaches(productIds);
        }

        return order;
    }

    async confirm(
        orderId: string,
        userId: string,
    ) {
        return this.ordersRepository.confirm(
            orderId,
            userId,
        );
    }

    private async invalidateProductCaches(
        productIds: string[],
    ) {
        if (productIds.length === 0) {
            return;
        }

        await Promise.all(
            productIds.map((productId) =>
                this.redis.del(`product:${productId}`),
            ),
        );
    }
}