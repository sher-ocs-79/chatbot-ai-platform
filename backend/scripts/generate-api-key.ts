import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { user } from '../lib/db/schema';

const email = process.argv[2];

if (!email) {
  console.error('Usage: pnpm api-key:generate <email>');
  process.exit(1);
}

async function main() {
  const client = postgres(process.env.POSTGRES_URL!);
  const db = drizzle(client);

  const [found] = await db.select().from(user).where(eq(user.email, email));

  if (!found) {
    console.error(`No user found with email: ${email}`);
    await client.end();
    process.exit(1);
  }

  const apiKey = `bk_${randomBytes(32).toString('hex')}`;
  await db.update(user).set({ apiKey }).where(eq(user.id, found.id));

  console.log(`\nAPI key generated for ${email}:\n`);
  console.log(`  ${apiKey}\n`);

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
