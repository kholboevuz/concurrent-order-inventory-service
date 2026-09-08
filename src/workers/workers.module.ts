import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module.js';
import { OrderExpirationWorker } from './order-expiration.worker.js';

@Module({
    imports: [
        RedisModule,
    ],
    providers: [
        OrderExpirationWorker,
    ],
})
export class WorkersModule { }