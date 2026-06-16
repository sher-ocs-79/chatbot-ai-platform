import { createServer } from 'node:http';
import {
  createChatbotSocket,
  buildGuardRegistry,
  buildDispatcherRegistry,
  runGuards,
  runDispatcher,
  type PipelineContext,
  type DispatcherFn,
} from '@yuaskme/chatbot-sdk';
import { groq } from '@ai-sdk/groq';
import { generateText } from 'ai';
import {
  QA_CACHE_ENABLED,
  generateQuestionEmbedding,
  findNearestCachedAnswer,
  saveCachedAnswer,
  incrementCacheHit,
} from './qaCacheService';
import { searchKnowledge } from './knowledgeService';
import { violationCheckStep } from './violationGuard';
import { getUserByApiKey } from './db';

const PORT = Number(process.env.CHATBOT_PORT ?? 3001);


const CHAT_MODEL_ID = process.env.CHATBOT_CHAT_MODEL ?? 'llama-3.3-70b-versatile';
const FAST_MODEL_ID = process.env.CHATBOT_FAST_MODEL ?? 'llama-3.1-8b-instant';

// Cast groq models to `any` — required while @ai-sdk/groq and the ai beta are
// on different internal spec versions (LanguageModelV3 vs LanguageModelV2).
const chatModel = groq(CHAT_MODEL_ID) as any;
const fastModel = groq(FAST_MODEL_ID) as any;

// ── Pipeline steps ────────────────────────────────────────────────────────────

/**
 * Validate the API key sent by the client.
 * On success, sets ctx.message.workspaceId to the owner's user ID.
 * On failure, emits an auth_error event and halts the pipeline.
 */
async function apiKeyAuthStep(ctx: PipelineContext): Promise<PipelineContext> {
  const apiKey = ctx.message.apiKey as string | undefined;

  if (!apiKey) {
    ctx.socket.emit('auth_error', { message: 'API key is required' });
    return { ...ctx, done: true };
  }

  const owner = await getUserByApiKey(apiKey);

  if (!owner) {
    ctx.socket.emit('auth_error', { message: 'Invalid API key' });
    return { ...ctx, done: true };
  }

  return {
    ...ctx,
    message: { ...ctx.message, workspaceId: owner.id },
  };
}

async function storeUserMessage(ctx: PipelineContext): Promise<PipelineContext> {
  const history = ctx.sessionStore.convoHistory.get(ctx.socket.id) ?? [];
  history.push({ role: 'user', content: ctx.message.message });
  ctx.sessionStore.convoHistory.set(ctx.socket.id, history);
  return ctx;
}

async function classifyIntent(ctx: PipelineContext): Promise<PipelineContext> {
  const { text } = await generateText({
    model: fastModel,
    system:
      'Classify the user message intent. Reply with exactly one lowercase word from: greeting, question, request, complaint, chitchat, farewell, default.',
    messages: [{ role: 'user', content: ctx.message.message }],
  });
  return { ...ctx, intent: text.trim().toLowerCase() };
}

async function guardStep(ctx: PipelineContext): Promise<PipelineContext> {
  const guards = ctx.guardRegistry['general'] ?? [];
  const handled = await runGuards(guards, ctx);
  return handled ? { ...ctx, done: true } : ctx;
}

/**
 * Retrieve relevant knowledge base chunks for the user's question.
 * Reuses the embedding already computed by qaCacheLookupStep when available.
 * Stores matched chunks in ctx._kbContext for use in respondStep.
 */
async function kbRetrievalStep(ctx: PipelineContext): Promise<PipelineContext> {
  if (ctx.done) return ctx;

  const workspaceId = ctx.message.workspaceId as string | undefined;
  if (!workspaceId) return ctx;

  const embedding = (ctx._qaCacheEmbedding as number[] | undefined)
    ?? await generateQuestionEmbedding(ctx.message.message as string);

  if (!embedding) return ctx;

  const chunks = await searchKnowledge({ workspaceId, embedding });

  const question = ctx.message.message as string;
  console.log(`[kb] query="${question}" workspaceId=${workspaceId} results=${chunks.length} threshold=${process.env.KB_THRESHOLD ?? '0.60'}`);
  if (chunks.length > 0) {
    for (const c of chunks) {
      console.log(`[kb]   chunk ${c.id} similarity=${c.similarity.toFixed(4)} title="${c.title}"`);
    }
  }

  if (chunks.length === 0) return ctx;

  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.title ? `**${c.title}**\n` : ''}${c.content}`)
    .join('\n\n');

  console.log(`[kb] Injecting ${chunks.length} chunk(s) into system prompt`);
  return {
    ...ctx,
    _kbContext: context,
    _kbChunks: chunks.map((c) => ({ id: c.id, title: c.title, similarity: c.similarity })),
  };
}

/**
 * Check qa_cache before hitting the LLM.
 * Sets ctx.done = true and emits the cached answer on a hit, so respondStep is
 * a no-op. On a miss, stores the pre-computed embedding in ctx._qaCacheEmbedding
 * so the save step can reuse it without a second API call.
 */
async function qaCacheLookupStep(
  ctx: PipelineContext,
): Promise<PipelineContext> {
  if (!QA_CACHE_ENABLED || ctx.done) return ctx;

  const workspaceId = ctx.message.workspaceId as string | undefined;
  if (!workspaceId) {
    console.log('[qa-cache] No workspaceId in message — skipping cache');
    return ctx;
  }

  const question = ctx.message.message as string;

  const embedding = await generateQuestionEmbedding(question);
  if (!embedding) return ctx; // embedding failure — bypass cache, continue to AI

  const cached = await findNearestCachedAnswer({ workspaceId, embedding });

  if (cached) {
    console.log(
      `[qa-cache] Hit: ${cached.id} (similarity: ${cached.similarity.toFixed(4)})`,
    );

    ctx.socket.emit('message', {
      message: cached.answerText,
      answer_source: 'qa_cache',
      cache_hit: true,
      similarity_score: parseFloat(cached.similarity.toFixed(4)),
      qa_cache_id: cached.id,
    });

    // Non-blocking hit count update
    incrementCacheHit(cached.id).catch(() => {});

    return {
      ...ctx,
      done: true,
      responseData: {
        text: cached.answerText,
        answer_source: 'qa_cache',
        cache_hit: true,
        similarity_score: cached.similarity,
        qa_cache_id: cached.id,
      },
    };
  }

  console.log('[qa-cache] Miss — proceeding to AI');
  // Stash the embedding so qaCacheSaveStep can reuse it
  return { ...ctx, _qaCacheEmbedding: embedding };
}

// When true, the bot refuses to answer if no KB chunks matched (default).
// Set KB_STRICT_MODE=false to allow the LLM to fall back to general knowledge.
const KB_STRICT_MODE = process.env.KB_STRICT_MODE !== 'false';

/**
 * Run the LLM. Skipped on cache hit (ctx.done === true).
 */
async function respondStep(ctx: PipelineContext): Promise<PipelineContext> {
  if (ctx.done) return ctx;

  const kbContext = ctx._kbContext as string | undefined;

  const conversationalIntents = new Set(['greeting', 'farewell', 'chitchat']);
  const isConversational = conversationalIntents.has(ctx.intent ?? '');

  if (KB_STRICT_MODE && !kbContext && !isConversational) {
    const reply = process.env.KB_MISS_MESSAGE ?? "I don't have information on that topic in my knowledge base.";
    ctx.socket.emit('message', {
      message: reply,
      answer_source: 'kb_miss',
      kb_used: false,
      kb_chunks: [],
    });
    return { ...ctx, done: true, responseData: { text: reply, answer_source: 'kb_miss', kb_used: false } };
  }

  const history = ctx.sessionStore.convoHistory.get(ctx.socket.id) ?? [];

  const system = kbContext
    ? `You are a friendly assistant. Use the following knowledge to answer the user's question when relevant. Keep your responses concise and helpful.\n\nKnowledge:\n${kbContext}`
    : 'You are a friendly assistant. Keep your responses concise and helpful.';

  const { text } = await generateText({
    model: chatModel,
    system,
    messages: history,
  });

  const kbChunks = ctx._kbChunks as { id: string; title: string | null; similarity: number }[] | undefined;

  ctx.socket.emit('message', {
    message: text,
    answer_source: 'ai',
    cache_hit: false,
    kb_used: !!kbContext,
    kb_chunks: kbChunks ?? [],
  });

  history.push({ role: 'assistant', content: text });
  ctx.sessionStore.convoHistory.set(ctx.socket.id, history);

  return {
    ...ctx,
    responseData: {
      text,
      answer_source: 'ai',
      cache_hit: false,
      kb_used: !!kbContext,
      kb_chunks: kbChunks ?? [],
    },
  };
}

/**
 * Persist the AI-generated answer to qa_cache for future reuse.
 * Runs only after a cache miss + successful LLM response.
 */
async function qaCacheSaveStep(ctx: PipelineContext): Promise<PipelineContext> {
  // Skip on cache hit (done=true) or if the response came from the cache already
  if (!QA_CACHE_ENABLED || ctx.done) return ctx;

  const workspaceId = ctx.message.workspaceId as string | undefined;
  const text = ctx.responseData?.text as string | undefined;
  const embedding = ctx._qaCacheEmbedding as number[] | undefined;

  if (!workspaceId || !text || !embedding) return ctx;

  // Fire-and-forget — don't delay the response for cache persistence
  saveCachedAnswer({
    workspaceId,
    question: ctx.message.message as string,
    embedding,
    answer: text,
    model: CHAT_MODEL_ID,
  }).catch((err: Error) => {
    console.error('[qa-cache] Background save failed:', err.message);
  });

  return ctx;
}

async function dispatchStep(ctx: PipelineContext): Promise<PipelineContext> {
  await runDispatcher(ctx.dispatcherRegistry, ctx.intent ?? 'default', ctx);
  return ctx;
}

// ── Registries ────────────────────────────────────────────────────────────────

const guardRegistry = buildGuardRegistry([
  // Add guards here, e.g.: { for: 'general', guard: myGuard }
]);

const dispatcherRegistry = buildDispatcherRegistry([
  // Add intent dispatchers here, e.g.: { intent: 'booking', dispatcher: bookingDispatcher }
  { intent: 'default', dispatcher: (async () => {}) as DispatcherFn },
]);

// ── Server ────────────────────────────────────────────────────────────────────

const httpServer = createServer();

createChatbotSocket(httpServer, {
  pipeline: [
    apiKeyAuthStep,
    storeUserMessage,
    classifyIntent,
    guardStep,
    violationCheckStep, // safety guardrail before cache and LLM
    qaCacheLookupStep,  // cache check before expensive LLM call
    kbRetrievalStep,    // inject relevant knowledge before LLM
    respondStep,
    qaCacheSaveStep,   // persist new AI answers for future reuse
    dispatchStep,
  ],
  guardRegistry,
  dispatcherRegistry,
  chatEvent: 'chat',
  corsOptions: { origin: true },
  onError: async (error: Error, ctx: PipelineContext) => {
    console.error('[chatbot] Pipeline error:', error.message);
    ctx.socket.emit('message', { message: "Sorry, I couldn't process that. Please try again." });
  },
});

httpServer.listen(PORT, () => {
  console.log(`[chatbot-sdk] Socket.IO server listening on http://localhost:${PORT}`);
});
