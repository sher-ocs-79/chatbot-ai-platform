import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';
import postgres from 'postgres';

export const QA_CACHE_ENABLED = process.env.QA_CACHE_ENABLED !== 'false';
export const QA_CACHE_THRESHOLD = parseFloat(
  process.env.QA_CACHE_THRESHOLD ?? '0.90',
);

export const QA_EMBEDDING_MODEL =
  process.env.QA_EMBEDDING_MODEL ?? 'text-embedding-3-small';
const MIN_ANSWER_LENGTH = 20;

// Patterns that indicate an answer must never be cached
const SKIP_CACHE_PATTERNS = [
  /policy violation/i,
  /please\s+(fill|complete|submit).*form/i,
  /contact.*form/i,
  /i['']?m unable to (help|assist)/i,
  /i don['']?t have.*information/i,
  /sorry,?\s+i (can['']?t|cannot)/i,
];

let _sql: ReturnType<typeof postgres> | null = null;

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    if (!process.env.POSTGRES_URL) {
      throw new Error('[qa-cache] POSTGRES_URL is not defined');
    }
    _sql = postgres(process.env.POSTGRES_URL);
  }
  return _sql;
}

// Encode a number[] as the pgvector literal '[0.1,0.2,...]'
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export async function generateQuestionEmbedding(
  question: string,
): Promise<number[] | null> {
  try {
    const { embedding } = await embed({
      model: openai.embedding(QA_EMBEDDING_MODEL),
      value: question,
    });
    return embedding;
  } catch (error) {
    console.error(
      '[qa-cache] Failed to generate embedding:',
      (error as Error).message,
    );
    return null;
  }
}

export interface CachedAnswer {
  id: string;
  answerText: string;
  similarity: number;
  sourceType: string | null;
  sourceIds: unknown | null;
  sourceUrls: unknown | null;
}

export async function findNearestCachedAnswer({
  workspaceId,
  embedding,
  threshold,
}: {
  workspaceId: string;
  embedding: number[];
  threshold?: number;
}): Promise<CachedAnswer | null> {
  const effectiveThreshold = threshold ?? QA_CACHE_THRESHOLD;

  try {
    const sql = getSql();
    const vec = toVectorLiteral(embedding);

    // postgres tagged-template parameters become $N in the wire protocol;
    // the ::vector cast is part of the SQL string, not the parameter value.
    const rows = await sql<
      {
        id: string;
        answer_text: string;
        source_type: string | null;
        source_ids: unknown | null;
        source_urls: unknown | null;
        similarity: string;
      }[]
    >`
      SELECT
        id,
        answer_text,
        source_type,
        source_ids,
        source_urls,
        1 - (question_embedding <=> ${vec}::vector) AS similarity
      FROM qa_cache
      WHERE workspace_id = ${workspaceId}
        AND invalidated_at IS NULL
      ORDER BY question_embedding <=> ${vec}::vector
      LIMIT 1
    `;

    if (rows.length === 0) return null;

    const row = rows[0];
    const similarity = parseFloat(row.similarity);

    if (similarity < effectiveThreshold) {
      console.log(
        `[qa-cache] Miss: similarity ${similarity.toFixed(4)} < threshold ${effectiveThreshold}`,
      );
      return null;
    }

    return {
      id: row.id,
      answerText: row.answer_text,
      similarity,
      sourceType: row.source_type,
      sourceIds: row.source_ids,
      sourceUrls: row.source_urls,
    };
  } catch (error) {
    console.error('[qa-cache] Search failed:', (error as Error).message);
    return null;
  }
}

export async function saveCachedAnswer({
  workspaceId,
  question,
  embedding,
  answer,
  sourceType,
  sourceIds,
  sourceUrls,
  model,
}: {
  workspaceId: string;
  question: string;
  embedding: number[];
  answer: string;
  sourceType?: string;
  sourceIds?: unknown;
  sourceUrls?: unknown;
  model?: string;
}): Promise<string | null> {
  if (!shouldCacheAnswer(answer)) {
    console.log('[qa-cache] Skipping save: answer not eligible for caching');
    return null;
  }

  try {
    const sql = getSql();
    const vec = toVectorLiteral(embedding);

    // For JSONB columns, pass the raw JS value — the postgres driver serialises
    // objects/arrays to JSON automatically, and null becomes SQL NULL.
    const srcIds = sourceIds ?? null;
    const srcUrls = sourceUrls ?? null;

    const rows = await sql<{ id: string }[]>`
      INSERT INTO qa_cache (
        workspace_id,
        question_text,
        question_embedding,
        answer_text,
        source_type,
        source_ids,
        source_urls,
        model,
        hit_count,
        created_at,
        updated_at
      ) VALUES (
        ${workspaceId},
        ${question},
        ${vec}::vector,
        ${answer},
        ${sourceType ?? null},
        ${srcIds as any},
        ${srcUrls as any},
        ${model ?? null},
        0,
        now(),
        now()
      )
      RETURNING id
    `;

    const id = rows[0]?.id ?? null;
    if (id) {
      console.log(`[qa-cache] Saved new entry: ${id}`);
    }
    return id;
  } catch (error) {
    console.error('[qa-cache] Save failed:', (error as Error).message);
    return null;
  }
}

export async function incrementCacheHit(cacheId: string): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      UPDATE qa_cache
      SET
        hit_count   = hit_count + 1,
        last_hit_at = now(),
        updated_at  = now()
      WHERE id = ${cacheId}
    `;
  } catch (error) {
    console.error('[qa-cache] Increment hit failed:', (error as Error).message);
  }
}

export async function invalidateCacheBySource({
  workspaceId,
  sourceType,
  sourceId,
}: {
  workspaceId: string;
  sourceType: string;
  sourceId: string;
}): Promise<number> {
  try {
    const sql = getSql();
    // source_ids is stored as a JSONB array; @> checks if it contains the sourceId element
    const rows = await sql<{ id: string }[]>`
      UPDATE qa_cache
      SET
        invalidated_at = now(),
        updated_at     = now()
      WHERE workspace_id = ${workspaceId}
        AND source_type  = ${sourceType}
        AND source_ids   @> ${JSON.stringify([sourceId])}::jsonb
        AND invalidated_at IS NULL
      RETURNING id
    `;
    console.log(
      `[qa-cache] Invalidated ${rows.length} entries for ${sourceType}:${sourceId}`,
    );
    return rows.length;
  } catch (error) {
    console.error('[qa-cache] Invalidate failed:', (error as Error).message);
    return 0;
  }
}

function shouldCacheAnswer(answer: string): boolean {
  if (!answer || answer.trim().length < MIN_ANSWER_LENGTH) return false;
  return !SKIP_CACHE_PATTERNS.some((pattern) => pattern.test(answer));
}
