import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    UseGuards,
    BadRequestException,
    Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';


interface AuthenticatedRequest {
    user: {
        userId: string;
        email: string;
    };
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    constructor(
        private readonly ordersService: OrdersService,
    ) { }

    @Post()
    create(
        @Req() req: AuthenticatedRequest,
        @Headers('idempotency-key') idempotencyKey: string,
        @Body() dto: CreateOrderDto,
    ) {
        if (!idempotencyKey?.trim()) {
            throw new BadRequestException(
                'Idempotency-Key header is required',
            );
        }

        return this.ordersService.create(
            req.user.userId,
            idempotencyKey.trim(),
            dto,
        );
    }

    @Get(':id')
    findById(
        @Req() req: AuthenticatedRequest,
        @Param('id') orderId: string,
    ) {
        return this.ordersService.findById(
            orderId,
            req.user.userId,
        );
    }

    @Post(':id/cancel')
    cancel(
        @Req() req: AuthenticatedRequest,
        @Param('id') orderId: string,
    ) {
        return this.ordersService.cancel(
            orderId,
            req.user.userId,
        );
    }

    @Post(':id/confirm')
    confirm(
        @Req() req: AuthenticatedRequest,
        @Param('id') orderId: string,
    ) {
        return this.ordersService.confirm(
            orderId,
            req.user.userId,
        );
    }
}