const API_URL = 'http://localhost:8080/api';
const PRODUCT_ID = '0f023dde-24ef-4a81-9340-d55144868912';

const TOKEN = process.env.JWT_TOKEN
if (!TOKEN) {
    console.error('JWT_TOKEN environment variable is required');
    process.exit(1);
}

async function createOrder(index) {
    const response = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `concurrency-test-${Date.now()}-${index}`,
        },
        body: JSON.stringify({
            items: [
                {
                    productId: PRODUCT_ID,
                    quantity: 1,
                },
            ],
        }),
    });

    let body;

    try {
        body = await response.json();
    } catch {
        body = await response.text();
    }

    return {
        index,
        status: response.status,
        body,
    };
}

async function main() {
    console.log('Starting\n');

    const requests = Array.from({ length: 50 }, (_, index) =>
        createOrder(index),
    );

    const results = await Promise.all(requests);

    const successful = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    const other = results.filter(
        (r) => r.status !== 201 && r.status !== 409,
    );

    console.log('RESULT');
    console.log(`Total: ${results.length}`);
    console.log(`201: ${successful.length}`);
    console.log(`409: ${conflicts.length}`);
    console.log(`Other: ${other.length}`);

    if (other.length > 0) {
        console.log('\nUnexpected responses:');
        console.dir(other, { depth: null });
    }

    console.log('\nEXPECTED');
    console.log('201: 10');
    console.log('409: 40');
    console.log('Other: 0');

    if (
        successful.length === 10 &&
        conflicts.length === 40 &&
        other.length === 0
    ) {
        console.log('\nTEST PASSED');
    } else {
        console.log('\nTEST FAILED');
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});