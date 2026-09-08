Concurrent Order & Inventory Reservation Service

Backend service for a mini marketplace. The main focus of the project is safe inventory reservation when multiple users create orders at the same time.

Stack

NestJS

TypeScript

PostgreSQL

Redis

JWT

Docker

Raw SQL (pg)

Features

User registration and login

JWT authentication

Product management

Order creation

Idempotency-Key

Order confirmation and cancellation

Automatic cancellation of unpaid orders after 15 minutes

Redis product cache

Concurrent stock reservation

Concurrency

PostgreSQL transactions with row-level locking (SELECT ... FOR UPDATE) are used for inventory updates.

For a product with stock = 10 and 50 concurrent requests:

50 requests
10 successful
40 rejected
final stock = 0

The concurrency E2E test verifies this behavior.

Redis

Redis is used as a cache for product reads.

PostgreSQL remains the source of truth. Product cache is invalidated after stock changes.

API

POST   /api/auth/register
POST   /api/auth/login

POST   /api/products
GET    /api/products
GET    /api/products/:id

POST   /api/orders
GET    /api/orders/:id
POST   /api/orders/:id/cancel
POST   /api/orders/:id/confirm

Run

Requirements:

Docker

Docker Compose

Start the project:

docker compose up --build

API:

http://localhost:8080

Tests

npm run test:e2e

The E2E test checks concurrent order creation and stock consistency.

Database

PostgreSQL is used as the main data store.

Database schema is available in:

dbdiagram.dbml

Database migrations are executed automatically when the API container starts.

Architecture

Controller
    ↓
Service
    ↓
Repository
    ↓
PostgreSQL
    ↑
  Redis
  Cache

The project uses a simple layered architecture with raw SQL.