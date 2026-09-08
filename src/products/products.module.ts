import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
import { ProductsRepository } from './products.repository.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
    imports: [
        AuthModule
    ],
    controllers: [ProductsController],
    providers: [
        ProductsService,
        ProductsRepository,
    ],
})
export class ProductsModule { }