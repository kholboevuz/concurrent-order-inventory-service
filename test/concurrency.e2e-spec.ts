import { describe, expect, it } from 'vitest';

const API_URL = 'http://localhost:8080/api';

async function requestJson(
    url: string,
    options?: RequestInit,
) {
    const response = await fetch(url, options);

    let body: unknown = null;

    try {
        body = await response.json();
    } catch {
        body = await response.text();
    }

    return {
        response,
        body,
    };
}

describe('Concurrency E2E', () => {
    it(
        'should allow exactly 10 orders for stock=10 under 50 concurrent requests',
        async () => {

            const uniqueEmail =
                `concurrency-${Date.now()}@example.com`;

            const register = await requestJson(
                `${API_URL}/auth/register`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: uniqueEmail,
                        password: 'Test123456',
                    }),
                },
            );

            expect(register.response.status).toBe(201);

            const login = await requestJson(
                `${API_URL}/auth/login`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: uniqueEmail,
                        password: 'Test123456',
                    }),
                },
            );

            expect(login.response.status).toBe(201);

            const accessToken = (
                login.body as {
                    accessToken: string;
                }
            ).accessToken;

            expect(accessToken).toBeTruthy();

            const product = await requestJson(
                `${API_URL}/products`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        name: `Concurrency Product ${Date.now()}`,
                        price: 100000,
                        stockQuantity: 10,
                    }),
                },
            );

            expect(product.response.status).toBe(201);

            const productId = (
                product.body as {
                    id: string;
                    stockQuantity: number;
                }
            ).id;

            expect(productId).toBeTruthy();

            const requests = Array.from(
                { length: 50 },
                (_, index) =>
                    requestJson(
                        `${API_URL}/orders`,
                        {
                            method: 'POST',
                            headers: {
                                Authorization:
                                    `Bearer ${accessToken}`,
                                'Content-Type':
                                    'application/json',
                                'Idempotency-Key':
                                    `vitest-concurrency-${Date.now()}-${index}`,
                            },
                            body: JSON.stringify({
                                items: [
                                    {
                                        productId,
                                        quantity: 1,
                                    },
                                ],
                            }),
                        },
                    ),
            );

            const results = await Promise.all(requests);

            const statuses = results.map(
                ({ response }) => response.status,
            );

            const successful = statuses.filter(
                (status) => status === 201,
            ).length;

            const conflicts = statuses.filter(
                (status) => status === 409,
            ).length;

            const other = statuses.filter(
                (status) =>
                    status !== 201 &&
                    status !== 409,
            ).length;

            expect(successful).toBe(10);
            expect(conflicts).toBe(40);
            expect(other).toBe(0);

            const finalProduct = await requestJson(
                `${API_URL}/products/${productId}`,
            );

            expect(finalProduct.response.status).toBe(200);

            const finalStock = (
                finalProduct.body as {
                    stockQuantity: number;
                }
            ).stockQuantity;

            expect(finalStock).toBe(0);
        },
        30_000,
    );
});