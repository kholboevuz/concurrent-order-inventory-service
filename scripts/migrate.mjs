import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, '..', 'migrations');

const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
});

async function migrate() {
    await client.connect();

    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

        const files = (await fs.readdir(migrationsDir))
            .filter((file) => file.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const existing = await client.query(
                `
        SELECT filename
        FROM schema_migrations
        WHERE filename = $1
        `,
                [file],
            );

            if (existing.rows.length > 0) {
                console.log(`Already applied: ${file}`);
                continue;
            }

            const migrationPath = path.join(migrationsDir, file);
            const sql = await fs.readFile(migrationPath, 'utf8');

            console.log(`Applying: ${file}`);

            await client.query('BEGIN');

            try {
                await client.query(sql);

                await client.query(
                    `
          INSERT INTO schema_migrations (filename)
          VALUES ($1)
          `,
                    [file],
                );

                await client.query('COMMIT');

                console.log(`Applied: ${file}`);
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
        }

        console.log('Migrations completed successfully.');
    } finally {
        await client.end();
    }
}

migrate().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
});