import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, desc, isNull } from 'drizzle-orm';
import postgres from 'postgres';
import {
  user,
  chat,
  message,
  messageDeprecated,
  vote,
  voteDeprecated,
  document,
  suggestion,
  stream,
} from '../lib/db/schema';

// ── arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

const command = args[0];
const email = flag('--email');
const id = flag('--id');
const userId = flag('--user-id');
const chatId = flag('--chat-id');
const limit = Number(flag('--limit') ?? '20');
const format = (flag('--format') ?? 'table') as 'table' | 'json';
const confirmed = hasFlag('--yes');

// ── output helpers ───────────────────────────────────────────────────────────

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log('(no rows)');
    return;
  }

  const cols = Object.keys(rows[0]);
  const widths = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)),
  );

  const sep = widths.map((w) => '-'.repeat(w + 2)).join('+');
  const header = cols.map((c, i) => ` ${c.padEnd(widths[i])} `).join('|');

  console.log(sep);
  console.log(header);
  console.log(sep);
  for (const row of rows) {
    const line = cols
      .map((c, i) => ` ${String(row[c] ?? '').padEnd(widths[i])} `)
      .join('|');
    console.log(line);
  }
  console.log(sep);
  console.log(`${rows.length} row(s)`);
}

function print(rows: Record<string, unknown>[]): void {
  if (format === 'json') {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    printTable(rows);
  }
}

function requireConfirm(description: string): void {
  if (!confirmed) {
    console.error(`This will ${description}.`);
    console.error('Re-run with --yes to confirm.');
    process.exit(1);
  }
}

// ── command registry ─────────────────────────────────────────────────────────

const QUERY_COMMANDS: Record<string, string> = {
  users:       'List users.                  Flags: --email',
  chats:       'List chats.                  Flags: --user-id',
  messages:    'List messages (v2).          Flags: --chat-id [required]',
  votes:       'List votes (v2).             Flags: --chat-id [required]',
  documents:   'List documents.              Flags: --user-id',
  suggestions: 'List suggestions.            Flags: --user-id',
  streams:     'List streams.                Flags: --chat-id',
};

const DELETE_COMMANDS: Record<string, string> = {
  'delete-user':        'Delete a user by --id or --email  (requires --yes)',
  'delete-chat':        'Delete a chat by --id             (requires --yes)',
  'delete-messages':    'Delete all messages in a chat     (requires --chat-id, --yes)',
  'delete-votes':       'Delete all votes in a chat        (requires --chat-id, --yes)',
  'delete-document':    'Delete a document by --id         (requires --yes)',
  'delete-suggestion':  'Delete a suggestion by --id       (requires --yes)',
  'delete-guests':      'Delete all users without an API key and their data  (requires --yes)',
};

function usage(): void {
  console.log(`
Usage: pnpm db:query <command> [flags]

Query commands:
${Object.entries(QUERY_COMMANDS)
  .map(([k, v]) => `  ${k.padEnd(14)} ${v}`)
  .join('\n')}

Delete commands (destructive — add --yes to confirm):
${Object.entries(DELETE_COMMANDS)
  .map(([k, v]) => `  ${k.padEnd(20)} ${v}`)
  .join('\n')}

Global flags:
  --limit <n>       Max rows to return (default: 20)
  --format <fmt>    Output format: table | json  (default: table)
  --yes             Confirm destructive operations
`);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    usage();
    process.exit(0);
  }

  const allCommands = { ...QUERY_COMMANDS, ...DELETE_COMMANDS };
  if (!(command in allCommands)) {
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  }

  const client = postgres(process.env.POSTGRES_URL!);
  const db = drizzle(client);

  try {
    switch (command) {
      // ── queries ─────────────────────────────────────────────────────────────

      case 'users': {
        const q = db.select().from(user);
        const rows = email
          ? await q.where(eq(user.email, email)).limit(limit)
          : await q.limit(limit);
        print(rows.map((r) => ({ ...r, password: r.password ? '***' : null })));
        break;
      }

      case 'chats': {
        const q = db.select().from(chat).orderBy(desc(chat.createdAt));
        const rows = userId
          ? await q.where(eq(chat.userId, userId)).limit(limit)
          : await q.limit(limit);
        print(rows as unknown as Record<string, unknown>[]);
        break;
      }

      case 'messages': {
        if (!chatId) {
          console.error('--chat-id is required for the messages command');
          process.exit(1);
        }
        const rows = await db
          .select()
          .from(message)
          .where(eq(message.chatId, chatId))
          .orderBy(desc(message.createdAt))
          .limit(limit);
        print(rows as unknown as Record<string, unknown>[]);
        break;
      }

      case 'votes': {
        if (!chatId) {
          console.error('--chat-id is required for the votes command');
          process.exit(1);
        }
        const rows = await db
          .select()
          .from(vote)
          .where(eq(vote.chatId, chatId))
          .limit(limit);
        print(rows as unknown as Record<string, unknown>[]);
        break;
      }

      case 'documents': {
        const q = db.select().from(document).orderBy(desc(document.createdAt));
        const rows = userId
          ? await q.where(eq(document.userId, userId)).limit(limit)
          : await q.limit(limit);
        print(rows as unknown as Record<string, unknown>[]);
        break;
      }

      case 'suggestions': {
        const q = db.select().from(suggestion).orderBy(desc(suggestion.createdAt));
        const rows = userId
          ? await q.where(eq(suggestion.userId, userId)).limit(limit)
          : await q.limit(limit);
        print(rows as unknown as Record<string, unknown>[]);
        break;
      }

      case 'streams': {
        const q = db.select().from(stream).orderBy(desc(stream.createdAt));
        const rows = chatId
          ? await q.where(eq(stream.chatId, chatId)).limit(limit)
          : await q.limit(limit);
        print(rows as unknown as Record<string, unknown>[]);
        break;
      }

      // ── deletes ─────────────────────────────────────────────────────────────

      case 'delete-user': {
        if (!id && !email) {
          console.error('--id or --email is required');
          process.exit(1);
        }
        requireConfirm(`permanently delete user (${id ?? email})`);

        // Resolve to a concrete user first so we can show what was deleted
        const [found] = id
          ? await db.select().from(user).where(eq(user.id, id)).limit(1)
          : await db.select().from(user).where(eq(user.email, email!)).limit(1);

        if (!found) {
          console.error('No matching user found.');
          process.exit(1);
        }

        // Delete child records in dependency order
        const chatsOfUser = await db
          .select({ id: chat.id })
          .from(chat)
          .where(eq(chat.userId, found.id));

        for (const c of chatsOfUser) {
          await db.delete(vote).where(eq(vote.chatId, c.id));
          await db.delete(voteDeprecated).where(eq(voteDeprecated.chatId, c.id));
          await db.delete(message).where(eq(message.chatId, c.id));
          await db.delete(messageDeprecated).where(eq(messageDeprecated.chatId, c.id));
          await db.delete(stream).where(eq(stream.chatId, c.id));
        }
        await db.delete(chat).where(eq(chat.userId, found.id));

        const docsOfUser = await db
          .select({ id: document.id, createdAt: document.createdAt })
          .from(document)
          .where(eq(document.userId, found.id));
        for (const d of docsOfUser) {
          await db
            .delete(suggestion)
            .where(eq(suggestion.documentId, d.id));
        }
        await db.delete(document).where(eq(document.userId, found.id));
        await db.delete(suggestion).where(eq(suggestion.userId, found.id));
        await db.delete(user).where(eq(user.id, found.id));

        console.log(`Deleted user: ${found.email} (${found.id})`);
        break;
      }

      case 'delete-chat': {
        if (!id) {
          console.error('--id is required');
          process.exit(1);
        }
        requireConfirm(`permanently delete chat ${id} and all its messages/votes/streams`);

        await db.delete(vote).where(eq(vote.chatId, id));
        await db.delete(voteDeprecated).where(eq(voteDeprecated.chatId, id));
        await db.delete(message).where(eq(message.chatId, id));
        await db.delete(messageDeprecated).where(eq(messageDeprecated.chatId, id));
        await db.delete(stream).where(eq(stream.chatId, id));
        const deleted = await db.delete(chat).where(eq(chat.id, id)).returning();

        if (deleted.length === 0) {
          console.error('No chat found with that id.');
          process.exit(1);
        }
        console.log(`Deleted chat: "${deleted[0].title}" (${id})`);
        break;
      }

      case 'delete-messages': {
        if (!chatId) {
          console.error('--chat-id is required');
          process.exit(1);
        }
        requireConfirm(`delete all messages and votes in chat ${chatId}`);

        await db.delete(vote).where(eq(vote.chatId, chatId));
        await db.delete(voteDeprecated).where(eq(voteDeprecated.chatId, chatId));
        const deleted = await db.delete(message).where(eq(message.chatId, chatId)).returning();
        await db.delete(messageDeprecated).where(eq(messageDeprecated.chatId, chatId));

        console.log(`Deleted ${deleted.length} message(s) from chat ${chatId}`);
        break;
      }

      case 'delete-votes': {
        if (!chatId) {
          console.error('--chat-id is required');
          process.exit(1);
        }
        requireConfirm(`delete all votes in chat ${chatId}`);

        const deleted = await db.delete(vote).where(eq(vote.chatId, chatId)).returning();
        await db.delete(voteDeprecated).where(eq(voteDeprecated.chatId, chatId));

        console.log(`Deleted ${deleted.length} vote(s) from chat ${chatId}`);
        break;
      }

      case 'delete-document': {
        if (!id) {
          console.error('--id is required');
          process.exit(1);
        }
        requireConfirm(`permanently delete document ${id} and its suggestions`);

        await db.delete(suggestion).where(eq(suggestion.documentId, id));
        const deleted = await db.delete(document).where(eq(document.id, id)).returning();

        if (deleted.length === 0) {
          console.error('No document found with that id.');
          process.exit(1);
        }
        console.log(`Deleted document: "${deleted[0].title}" (${id})`);
        break;
      }

      case 'delete-suggestion': {
        if (!id) {
          console.error('--id is required');
          process.exit(1);
        }
        requireConfirm(`permanently delete suggestion ${id}`);

        const deleted = await db.delete(suggestion).where(eq(suggestion.id, id)).returning();

        if (deleted.length === 0) {
          console.error('No suggestion found with that id.');
          process.exit(1);
        }
        console.log(`Deleted suggestion (${id})`);
        break;
      }

      case 'delete-guests': {
        const guests = await db.select().from(user).where(isNull(user.apiKey));

        if (guests.length === 0) {
          console.log('No guest users found.');
          break;
        }

        console.log(`Found ${guests.length} user(s) without an API key:`);
        for (const g of guests) console.log(`  ${g.email} (${g.id})`);

        requireConfirm(`permanently delete all ${guests.length} guest user(s) and their data`);

        let deleted = 0;
        for (const g of guests) {
          const chatsOfUser = await db
            .select({ id: chat.id })
            .from(chat)
            .where(eq(chat.userId, g.id));

          for (const c of chatsOfUser) {
            await db.delete(vote).where(eq(vote.chatId, c.id));
            await db.delete(voteDeprecated).where(eq(voteDeprecated.chatId, c.id));
            await db.delete(message).where(eq(message.chatId, c.id));
            await db.delete(messageDeprecated).where(eq(messageDeprecated.chatId, c.id));
            await db.delete(stream).where(eq(stream.chatId, c.id));
          }
          await db.delete(chat).where(eq(chat.userId, g.id));

          const docsOfUser = await db
            .select({ id: document.id })
            .from(document)
            .where(eq(document.userId, g.id));
          for (const d of docsOfUser) {
            await db.delete(suggestion).where(eq(suggestion.documentId, d.id));
          }
          await db.delete(document).where(eq(document.userId, g.id));
          await db.delete(suggestion).where(eq(suggestion.userId, g.id));
          await db.delete(user).where(eq(user.id, g.id));
          deleted++;
        }

        console.log(`Done. Deleted ${deleted} guest user(s).`);
        break;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
