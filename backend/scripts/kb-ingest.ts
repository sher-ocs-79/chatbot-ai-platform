import { readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { user } from '../lib/db/schema';
import { insertKnowledgeChunk, generateQuestionEmbedding } from '../knowledgeService';

const CHUNK_SIZE = parseInt(process.env.KB_CHUNK_SIZE ?? '800', 10);
const CHUNK_OVERLAP = parseInt(process.env.KB_CHUNK_OVERLAP ?? '100', 10);

function printUsage() {
  console.error(
    'Usage: pnpm kb:ingest <email> <file-path> [--title "Custom title"] [--replace]',
  );
  console.error('');
  console.error('Options:');
  console.error('  --title   Override the document title (defaults to filename)');
  console.error('  --replace Delete existing chunks for this file before ingesting');
}

function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length + 2 > CHUNK_SIZE && current.length > 0) {
      chunks.push(current.trim());
      // carry over tail for overlap
      const words = current.split(' ');
      const overlapWords = words.slice(Math.max(0, words.length - Math.ceil(CHUNK_OVERLAP / 5)));
      current = overlapWords.join(' ') + ' ' + paragraph;
    } else {
      current = current ? current + '\n\n' + paragraph : paragraph;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function main() {
  const args = process.argv.slice(2);

  const email = args[0];
  const filePath = args[1];

  if (!email || !filePath) {
    printUsage();
    process.exit(1);
  }

  let title: string | undefined;
  let replace = false;

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      title = args[++i];
    } else if (args[i] === '--replace') {
      replace = true;
    }
  }

  const absolutePath = resolve(filePath);
  const sourceFile = basename(absolutePath);
  const docTitle = title ?? sourceFile;

  let content: string;
  try {
    content = readFileSync(absolutePath, 'utf-8');
  } catch {
    console.error(`Error: Cannot read file: ${absolutePath}`);
    process.exit(1);
  }

  const client = postgres(process.env.POSTGRES_URL!);
  const db = drizzle(client);

  const [owner] = await db.select().from(user).where(eq(user.email, email));
  if (!owner) {
    console.error(`Error: No user found with email: ${email}`);
    await client.end();
    process.exit(1);
  }

  if (replace) {
    // Raw SQL delete since knowledgeService uses its own connection
    await client`
      DELETE FROM knowledge_base
      WHERE workspace_id = ${owner.id}
        AND source_file = ${sourceFile}
    `;
    console.log(`Removed existing chunks for "${sourceFile}"`);
  }

  const chunks = chunkText(content);
  console.log(`\nIngesting "${docTitle}" (${chunks.length} chunks) for ${email}...\n`);

  let inserted = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    process.stdout.write(`  Chunk ${i + 1}/${chunks.length}: embedding... `);

    const embedding = await generateQuestionEmbedding(chunk);
    if (!embedding) {
      console.log('SKIP (embedding failed)');
      continue;
    }

    const rows = await client<{ id: string }[]>`
      INSERT INTO knowledge_base (workspace_id, title, content, embedding, source_file, chunk_index)
      VALUES (
        ${owner.id},
        ${docTitle},
        ${chunk},
        ${`[${embedding.join(',')}]`}::vector,
        ${sourceFile},
        ${i}
      )
      RETURNING id
    `;

    if (rows[0]?.id) {
      inserted++;
      console.log(`done (id: ${rows[0].id})`);
    } else {
      console.log('SKIP (insert failed)');
    }
  }

  console.log(`\nDone. Inserted ${inserted}/${chunks.length} chunks.\n`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
