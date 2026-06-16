import postgres from 'postgres';
import { generateQuestionEmbedding } from './qaCacheService';

const KB_TOP_K = parseInt(process.env.KB_TOP_K ?? '3', 10);
const KB_THRESHOLD = parseFloat(process.env.KB_THRESHOLD ?? '0.60');

let _sql: ReturnType<typeof postgres> | null = null;

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    if (!process.env.POSTGRES_URL) {
      throw new Error('[kb] POSTGRES_URL is not defined');
    }
    _sql = postgres(process.env.POSTGRES_URL);
  }
  return _sql;
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

export interface KnowledgeChunk {
  id: string;
  title: string | null;
  content: string;
  similarity: number;
}

export async function searchKnowledge({
  workspaceId,
  embedding,
  topK = KB_TOP_K,
  threshold = KB_THRESHOLD,
}: {
  workspaceId: string;
  embedding: number[];
  topK?: number;
  threshold?: number;
}): Promise<KnowledgeChunk[]> {
  try {
    const sql = getSql();
    const vec = toVectorLiteral(embedding);

    const rows = await sql<
      { id: string; title: string | null; content: string; similarity: string }[]
    >`
      SELECT
        id,
        title,
        content,
        1 - (embedding <=> ${vec}::vector) AS similarity
      FROM knowledge_base
      WHERE workspace_id = ${workspaceId}
        AND 1 - (embedding <=> ${vec}::vector) >= ${threshold}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${topK}
    `;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      similarity: parseFloat(r.similarity),
    }));
  } catch (error) {
    console.error('[kb] Search failed:', (error as Error).message);
    return [];
  }
}

export async function insertKnowledgeChunk({
  workspaceId,
  title,
  content,
  embedding,
  sourceFile,
  chunkIndex,
}: {
  workspaceId: string;
  title?: string;
  content: string;
  embedding: number[];
  sourceFile?: string;
  chunkIndex?: number;
}): Promise<string | null> {
  try {
    const sql = getSql();
    const vec = toVectorLiteral(embedding);

    const rows = await sql<{ id: string }[]>`
      INSERT INTO knowledge_base (workspace_id, title, content, embedding, source_file, chunk_index)
      VALUES (
        ${workspaceId},
        ${title ?? null},
        ${content},
        ${vec}::vector,
        ${sourceFile ?? null},
        ${chunkIndex ?? 0}
      )
      RETURNING id
    `;

    return rows[0]?.id ?? null;
  } catch (error) {
    console.error('[kb] Insert failed:', (error as Error).message);
    return null;
  }
}

export async function deleteKnowledgeByFile({
  workspaceId,
  sourceFile,
}: {
  workspaceId: string;
  sourceFile: string;
}): Promise<number> {
  try {
    const sql = getSql();
    const rows = await sql<{ id: string }[]>`
      DELETE FROM knowledge_base
      WHERE workspace_id = ${workspaceId}
        AND source_file = ${sourceFile}
      RETURNING id
    `;
    return rows.length;
  } catch (error) {
    console.error('[kb] Delete failed:', (error as Error).message);
    return 0;
  }
}

export { generateQuestionEmbedding };
