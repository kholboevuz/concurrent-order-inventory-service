import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProductsModule } from './products/products.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { WorkersModule } from './workers/workers.module.js';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    ScheduleModule.forRoot(),

    DatabaseModule,
    AuthModule,
    ProductsModule,
    OrdersModule,
    WorkersModule,
    RedisModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
