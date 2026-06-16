# Chatbot AI Platform

A production-ready, multi-tenant AI chatbot platform built with a Socket.IO pipeline architecture. The backend runs a configurable message-processing pipeline with knowledge base retrieval (RAG), semantic QA caching, intent classification, and a content-safety violation guard. The frontend is a minimal React chat UI that connects over WebSocket.

---

## Architecture Overview

```
Frontend (React + Vite)          Backend (Node.js + TypeScript)
┌─────────────────────┐          ┌───────────────────────────────────────────────┐
│  Chat UI            │          │  Socket.IO Pipeline                           │
│  socket.io-client   │◄────────►│                                               │
└─────────────────────┘          │  apiKeyAuth → storeMessage → classifyIntent   │
                                 │  → guard → violationCheck → qaCacheLookup     │
                                 │  → kbRetrieval → respond → qaCacheSave        │
                                 │  → dispatch                                   │
                                 │                                               │
                                 │  LLM: Groq (llama-3.3-70b / llama-3.1-8b)    │
                                 │  Embeddings: OpenAI text-embedding-3-small    │
                                 │  DB: PostgreSQL + pgvector (Neon)             │
                                 └───────────────────────────────────────────────┘
```

### Pipeline Steps

| Step | Purpose |
|------|---------|
| `apiKeyAuthStep` | Validates the client API key; resolves the workspace (user) ID |
| `storeUserMessage` | Appends the user message to the in-memory conversation history |
| `classifyIntent` | Uses the fast LLM to label intent: `greeting`, `question`, `request`, `complaint`, `chitchat`, `farewell`, `default` |
| `guardStep` | Runs custom guard plugins from the guard registry |
| `violationCheckStep` | Keyword pre-filter + LLM classifier; warns on first violation, disables session on second |
| `qaCacheLookupStep` | Semantic similarity search against cached Q&A pairs — bypasses the LLM on a hit |
| `kbRetrievalStep` | pgvector cosine similarity search over the workspace knowledge base; injects matching chunks into the system prompt |
| `respondStep` | Calls the chat LLM with conversation history and optional KB context |
| `qaCacheSaveStep` | Persists the new AI answer to `qa_cache` for future reuse (fire-and-forget) |
| `dispatchStep` | Routes to intent-specific dispatcher functions |

---

## Project Structure

```
chatbot-ai-platform/
├── backend/
│   ├── chatbot.ts            # Server entry point & pipeline definition
│   ├── db.ts                 # Drizzle DB client + user lookup
│   ├── knowledgeService.ts   # Knowledge base search & ingestion helpers
│   ├── qaCacheService.ts     # Semantic QA cache (embed, lookup, save, invalidate)
│   ├── violationGuard.ts     # Content safety pipeline step + LLM classifier
│   ├── violationService.ts   # Violation state persistence (DB upsert / audit log)
│   ├── drizzle.config.ts     # Drizzle Kit configuration
│   ├── lib/db/               # Drizzle schema definitions
│   ├── migrations/           # SQL migration files
│   └── scripts/
│       ├── generate-api-key.ts   # Create a new API key for a user
│       ├── kb-ingest.ts          # Ingest a document into the knowledge base
│       ├── kb-diagnose.ts        # Inspect knowledge base contents
│       ├── migrate.ts            # Run pending DB migrations
│       └── db-query.ts           # Ad-hoc DB query helper
└── frontend/
    ├── src/
    │   ├── App.tsx               # Chat UI component
    │   ├── chatbot-client.ts     # Typed Socket.IO wrapper
    │   └── main.tsx              # React entry point
    ├── index.html
    └── vite.config.ts
```

---

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (backend uses pnpm; frontend uses npm)
- **PostgreSQL** with the `pgvector` extension enabled (e.g. [Neon](https://neon.tech) — free tier works)
- **Groq** API key — [console.groq.com](https://console.groq.com)
- **OpenAI** API key — used for embeddings only

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd chatbot-ai-platform
```

### 2. Set up the backend

```bash
cd backend
pnpm install
```

Create `backend/.env.local`:

```env
# PostgreSQL connection string (must have pgvector enabled)
POSTGRES_URL="postgres://user:password@host/dbname?sslmode=require"

# LLM providers
GROQ_API_KEY="gsk_..."
OPENAI_API_KEY="sk-..."

# Optional — defaults shown
QA_CACHE_ENABLED=true
QA_CACHE_THRESHOLD=0.90
QA_EMBEDDING_MODEL=text-embedding-3-small
CHATBOT_CHAT_MODEL=llama-3.3-70b-versatile
CHATBOT_FAST_MODEL=llama-3.1-8b-instant
KB_STRICT_MODE=true
```

### 3. Run database migrations

```bash
pnpm db:migrate
```

This runs all pending SQL migrations in `backend/migrations/`. You also need to create the following tables manually if they don't exist from the SDK schema:

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base chunks
CREATE TABLE IF NOT EXISTS knowledge_base (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  title        text,
  content      text NOT NULL,
  embedding    vector(1536),
  source_file  text,
  chunk_index  integer DEFAULT 0,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX ON knowledge_base USING ivfflat (embedding vector_cosine_ops);

-- QA semantic cache
CREATE TABLE IF NOT EXISTS qa_cache (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL,
  question_text      text NOT NULL,
  question_embedding vector(1536),
  answer_text        text NOT NULL,
  source_type        text,
  source_ids         jsonb,
  source_urls        jsonb,
  model              text,
  hit_count          integer DEFAULT 0,
  last_hit_at        timestamptz,
  invalidated_at     timestamptz,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

-- Violation tracking
CREATE TABLE IF NOT EXISTS session_violations (
  workspace_id   uuid NOT NULL,
  session_token  text NOT NULL,
  violation_count integer DEFAULT 0,
  disabled_at    timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  PRIMARY KEY (workspace_id, session_token)
);

CREATE TABLE IF NOT EXISTS violation_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  session_token   text NOT NULL,
  message_text    text,
  violation_count integer,
  created_at      timestamptz DEFAULT now()
);
```

### 4. Create a user and generate an API key

```bash
# First insert a user manually, or use your app's registration flow.
# Then generate an API key for that user's email:
pnpm api-key:generate <email>
```

The script prints the generated API key — copy it for the frontend and your clients.

### 5. Start the backend server

```bash
pnpm dev          # development (loads .env.local)
pnpm start        # production (reads env from process environment)
```

The server listens on port `3001` by default. Override with `PORT` or `CHATBOT_PORT`.

### 6. Set up the frontend

```bash
cd ../frontend
npm install
```

Create `frontend/.env.local`:

```env
VITE_SERVER_URL=http://localhost:3001
VITE_API_KEY=bk_your_api_key_here
```

### 7. Start the frontend

```bash
npm run dev        # development server (http://localhost:5173)
npm run build      # production build → frontend/dist/
npm run start      # serve the production build
```

---

## Knowledge Base

The knowledge base is per-workspace. Ingest a plain-text document to give the bot domain-specific context:

```bash
cd backend

# Basic ingestion
pnpm kb:ingest user@example.com ./docs/faq.txt

# With a custom title
pnpm kb:ingest user@example.com ./docs/pricing.txt --title "Pricing Guide"

# Replace existing chunks for the same file before re-ingesting
pnpm kb:ingest user@example.com ./docs/faq.txt --replace
```

The script chunks the document (default 800 chars with 100-char overlap), generates an embedding for each chunk via OpenAI, and stores them in `knowledge_base`.

Diagnose what's in the knowledge base:

```bash
pnpm kb:diagnose user@example.com
```

### Strict vs. permissive mode

- **`KB_STRICT_MODE=true` (default)** — the bot replies with `KB_MISS_MESSAGE` when no knowledge chunk matches. Set `KB_MISS_MESSAGE` to customise the fallback reply.
- **`KB_STRICT_MODE=false`** — the LLM answers from general training knowledge when the KB has no match.

---

## Configuration Reference

### Backend environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` / `CHATBOT_PORT` | `3001` | Socket.IO server port |
| `POSTGRES_URL` | — | PostgreSQL connection string (required) |
| `GROQ_API_KEY` | — | Groq API key (required) |
| `OPENAI_API_KEY` | — | OpenAI API key for embeddings (required) |
| `CHATBOT_CHAT_MODEL` | `llama-3.3-70b-versatile` | LLM used for final chat responses |
| `CHATBOT_FAST_MODEL` | `llama-3.1-8b-instant` | LLM used for intent classification and violation guard |
| `QA_CACHE_ENABLED` | `true` | Enable/disable the QA semantic cache |
| `QA_CACHE_THRESHOLD` | `0.90` | Minimum cosine similarity to count as a cache hit |
| `QA_EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `KB_STRICT_MODE` | `true` | Refuse off-KB questions when `true` |
| `KB_MISS_MESSAGE` | *(built-in)* | Reply when KB has no matching chunk |
| `KB_TOP_K` | `3` | Max knowledge chunks to inject per query |
| `KB_THRESHOLD` | `0.60` | Min similarity to include a KB chunk |
| `KB_CHUNK_SIZE` | `800` | Target character count per ingestion chunk |
| `KB_CHUNK_OVERLAP` | `100` | Overlap characters between adjacent chunks |

### Frontend environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SERVER_URL` | `http://localhost:3001` | Backend Socket.IO server URL |
| `VITE_API_KEY` | *(hardcoded fallback)* | API key sent on connection |

---

## Content Safety

The violation guard runs on every message before the LLM is called:

1. **Keyword pre-filter** — regex patterns catch obvious violations instantly with no LLM call.
2. **LLM classifier** — classifies remaining messages as `SAFE`, `OFF_TOPIC`, or `VIOLATION` using the fast model.
3. **Warning on 1st violation** — the session receives a warning message; the pipeline halts for that turn.
4. **Session disabled on 2nd violation** — the session is disabled in-memory and in the database. All subsequent messages are rejected until a new session is started.

Violation state is persisted per `(workspaceId, sessionToken)` pair, so it survives server restarts.

---

## Deployment

### Backend (Railway / Fly / any Node host)

Set all environment variables listed above on your hosting provider. The `start` script (`tsx chatbot.ts`) reads from the process environment directly.

### Frontend (Railway / Vercel / Netlify)

```bash
npm run build   # outputs to frontend/dist/
```

Set `VITE_SERVER_URL` to your production backend URL at build time. The `start` script serves the built assets with `vite preview`.

---

## npm / pnpm Scripts

### Backend (`backend/`)

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx --env-file=.env.local chatbot.ts` | Start with local env file |
| `start` | `tsx chatbot.ts` | Start (reads from process env) |
| `api-key:generate` | `tsx … scripts/generate-api-key.ts` | Generate an API key for a user |
| `kb:ingest` | `tsx … scripts/kb-ingest.ts` | Ingest a document into the KB |
| `kb:diagnose` | `tsx … scripts/kb-diagnose.ts` | Inspect knowledge base contents |
| `db:generate` | `drizzle-kit generate` | Generate migration files from schema |
| `db:migrate` | `tsx … scripts/migrate.ts` | Run pending migrations |
| `db:query` | `tsx … scripts/db-query.ts` | Ad-hoc DB queries |

### Frontend (`frontend/`)

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `vite` | Start dev server |
| `build` | `tsc && vite build` | Production build |
| `preview` | `vite preview` | Preview the production build locally |
| `start` | `vite preview --host --port $PORT` | Serve production build (deployment) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend runtime | Node.js + TypeScript (`tsx`) |
| WebSocket | Socket.IO via `@yuaskme/chatbot-sdk` |
| Chat LLM | Groq — `llama-3.3-70b-versatile` |
| Fast/classifier LLM | Groq — `llama-3.1-8b-instant` |
| Embeddings | OpenAI — `text-embedding-3-small` |
| AI SDK | Vercel AI SDK v5 (`ai`, `@ai-sdk/groq`, `@ai-sdk/openai`) |
| Database | PostgreSQL + `pgvector` |
| ORM / migrations | Drizzle ORM + Drizzle Kit |
| DB client | `postgres` (node-postgres) |
| Frontend | React 18 + TypeScript |
| Frontend build | Vite 8 |
| Package manager | pnpm (backend) · npm (frontend) |
