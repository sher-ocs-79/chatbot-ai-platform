import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { user, type User } from './lib/db/schema';

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUserByApiKey(
  apiKey: string,
): Promise<User | undefined> {
  const rows = await db
    .select()
    .from(user)
    .where(eq(user.apiKey, apiKey))
    .limit(1);
  return rows[0];
}
