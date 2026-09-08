import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from './database/database.service.js';


@Injectable()
export class AppService implements OnModuleInit {
  constructor(private readonly database: DatabaseService) { }

  async onModuleInit() {
    const result = await this.database.query<{ now: Date }>(
      'SELECT NOW() AS now',
    );

    console.log('PostgreSQL connected:', result.rows[0]);
  }

  getHello(): string {
    return 'Concurrent Order Inventory Service';
  }
}