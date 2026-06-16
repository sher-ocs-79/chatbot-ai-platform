import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const client = postgres(process.env.POSTGRES_URL!, { max: 1 });
const db = drizzle(client);

(async () => {
  await migrate(db, { migrationsFolder: './migrations' });
  await client.end();
})();
