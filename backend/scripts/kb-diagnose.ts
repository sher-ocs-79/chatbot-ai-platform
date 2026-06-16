import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { user } from '../lib/db/schema';
import { generateQuestionEmbedding } from '../knowledgeService';

const email = process.argv[2];
const question = process.argv[3];

if (!email) {
  console.error('Usage: pnpm kb:diagnose <email> [test-question]');
  process.exit(1);
}

async function main() {
  const client = postgres(process.env.POSTGRES_URL!);
  const db = drizzle(client);

  // 1. Check user exists
  const [owner] = await db.select().from(user).where(eq(user.email, email));
  if (!owner) {
    console.error(`\n❌ No user found for email: ${email}`);
    await client.end();
    process.exit(1);
  }
  console.log(`\n✅ User found: ${owner.id} (${owner.email})`);

  // 2. Check knowledge_base table exists
  const tableCheck = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'knowledge_base'
    ) AS exists
  `;
  if (!tableCheck[0].exists) {
    console.error('\n❌ Table "knowledge_base" does not exist — run the migration first (pnpm build or pnpm db:migrate)');
    await client.end();
    process.exit(1);
  }
  console.log('\n✅ Table "knowledge_base" exists');

  // 3. Count rows for this workspace
  const countRows = await client<{ count: string }[]>`
    SELECT COUNT(*) AS count FROM knowledge_base WHERE workspace_id = ${owner.id}
  `;
  const count = parseInt(countRows[0].count, 10);
  console.log(`\n📦 Chunks for workspace ${owner.id}: ${count}`);

  if (count === 0) {
    console.error('\n❌ No chunks found for this workspace. Re-run kb:ingest with the same email.');
    await client.end();
    process.exit(1);
  }

  // 4. Show sample chunks
  const samples = await client<{ id: string; title: string | null; source_file: string | null; chunk_index: number; content: string }[]>`
    SELECT id, title, source_file, chunk_index, LEFT(content, 120) AS content
    FROM knowledge_base
    WHERE workspace_id = ${owner.id}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log('\n--- Sample chunks (latest 5) ---');
  for (const row of samples) {
    const snippet = row.content.replace(/\r\n|\r|\n/g, ' ').slice(0, 100);
    console.log(`  [chunk ${row.chunk_index}] ${row.source_file ?? 'unknown'}`);
    console.log(`  preview: ${snippet}`);
  }

  // 5. Optional: test similarity search with a question
  if (question) {
    console.log(`\n🔍 Testing similarity search for: "${question}"`);
    const embedding = await generateQuestionEmbedding(question);
    if (!embedding) {
      console.error('❌ Failed to generate embedding — check OPENAI_API_KEY');
      await client.end();
      process.exit(1);
    }
    const vec = `[${embedding.join(',')}]`;

    const results = await client<{ id: string; title: string | null; similarity: number; content: string }[]>`
      SELECT
        id,
        title,
        ROUND((1 - (embedding <=> ${vec}::vector))::numeric, 4) AS similarity,
        LEFT(content, 120) AS content
      FROM knowledge_base
      WHERE workspace_id = ${owner.id}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT 5
    `;

    const threshold = parseFloat(process.env.KB_THRESHOLD ?? '0.60');
    console.log(`\n  Top 5 matches (threshold=${threshold}):`);
    for (const r of results) {
      const sim = Number(r.similarity);
      const pass = sim >= threshold ? 'PASS' : 'FAIL';
      const snippet = r.content.replace(/\r\n|\r|\n/g, ' ').slice(0, 80);
      console.log(`  [${pass}] similarity=${sim.toFixed(4)}`);
      console.log(`         title: ${r.title}`);
      console.log(`         preview: ${snippet}`);
    }
    console.log(`\n  KB_THRESHOLD=${threshold} — lower it in .env.local if all scores show FAIL`);
  }

  console.log('');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
