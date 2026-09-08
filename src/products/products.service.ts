import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ProductsRepository } from './products.repository.js';
import { RedisService } from '../redis/redis.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';

@Injectable()
export class ProductsService {
    constructor(
        private readonly productsRepository: ProductsRepository,
        private readonly redis: RedisService,
    ) { }

    async create(dto: CreateProductDto) {
        const product =
            await this.productsRepository.create(dto);

        return this.serialize(product);
    }

    async findAll() {
        const products =
            await this.productsRepository.findAll();

        return products.map((product) =>
            this.serialize(product),
        );
    }

    async findById(id: string) {
        const cacheKey = `product:${id}`;

        const cached =
            await this.redis.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const product =
            await this.productsRepository.findById(id);

        if (!product) {
            throw new NotFoundException(
                'Product not found',
            );
        }

        const serialized = this.serialize(product);

        await this.redis.set(
            cacheKey,
            JSON.stringify(serialized),
            60,
        );

        return serialized;
    }

    private serialize(product: any) {
        return {
            id: product.id,
            name: product.name,
            price: Number(product.price),
            stockQuantity: product.stock_quantity,
            createdAt: product.created_at,
            updatedAt: product.updated_at,
        };
    }
}