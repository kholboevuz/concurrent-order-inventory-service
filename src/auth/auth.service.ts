import {
    ConflictException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../database/database.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';



interface UserRow {
    id: string;
    email: string;
    password_hash: string;
}

@Injectable()
export class AuthService {
    constructor(
        private readonly database: DatabaseService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) { }

    async register(dto: RegisterDto) {
        const existingUser = await this.database.query<{ id: string }>(
            `
      SELECT id
      FROM users
      WHERE email = $1
      `,
            [dto.email],
        );

        if (existingUser.rows.length > 0) {
            throw new ConflictException('User with this email already exists');
        }

        const passwordHash = await bcrypt.hash(dto.password, 12);

        const result = await this.database.query<{
            id: string;
            email: string;
            created_at: Date;
        }>(
            `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, created_at
      `,
            [dto.email, passwordHash],
        );

        return {
            id: result.rows[0].id,
            email: result.rows[0].email,
            createdAt: result.rows[0].created_at,
        };
    }

    async login(dto: LoginDto) {
        const result = await this.database.query<UserRow>(
            `
      SELECT id, email, password_hash
      FROM users
      WHERE email = $1
      `,
            [dto.email],
        );

        const user = result.rows[0];

        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const passwordMatches = await bcrypt.compare(
            dto.password,
            user.password_hash,
        );

        if (!passwordMatches) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const payload = {
            sub: user.id,
            email: user.email,
        };

        const accessToken = await this.jwtService.signAsync(payload);

        return {
            accessToken,
            tokenType: 'Bearer',
            expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '1d'),
        };
    }
}