import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | null = null;

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    if (!process.env.POSTGRES_URL) {
      throw new Error('[violation-service] POSTGRES_URL is not defined');
    }
    _sql = postgres(process.env.POSTGRES_URL);
  }
  return _sql;
}

export interface SessionViolationState {
  violationCount: number;
  disabled: boolean;
}

/**
 * Load persisted violation state for a session.
 * Returns null if no record exists yet (clean session).
 */
export async function loadSessionViolationState(
  workspaceId: string,
  sessionToken: string,
): Promise<SessionViolationState | null> {
  try {
    const sql = getSql();
    const rows = await sql<
      { violation_count: number; disabled_at: Date | null }[]
    >`
      SELECT violation_count, disabled_at
      FROM session_violations
      WHERE workspace_id = ${workspaceId}
        AND session_token = ${sessionToken}
    `;

    if (rows.length === 0) return null;

    return {
      violationCount: rows[0].violation_count,
      disabled: rows[0].disabled_at !== null,
    };
  } catch (err) {
    console.error(
      '[violation-service] loadSessionViolationState failed:',
      (err as Error).message,
    );
    return null;
  }
}

/**
 * Record a violation: upserts session_violations and appends to violation_events.
 * Returns the updated state after recording.
 */
export async function recordViolation(
  workspaceId: string,
  sessionToken: string,
  messageText: string,
): Promise<SessionViolationState> {
  const sql = getSql();

  // Upsert session state and atomically increment the count
  const rows = await sql<
    { violation_count: number; disabled_at: Date | null }[]
  >`
    INSERT INTO session_violations (workspace_id, session_token, violation_count, created_at, updated_at)
    VALUES (${workspaceId}, ${sessionToken}, 1, now(), now())
    ON CONFLICT (workspace_id, session_token) DO UPDATE
    SET
      violation_count = session_violations.violation_count + 1,
      updated_at      = now()
    RETURNING violation_count, disabled_at
  `;

  const newCount = rows[0].violation_count;

  // Disable the session on second violation
  let disabled = rows[0].disabled_at !== null;
  if (newCount >= 2 && !disabled) {
    await sql`
      UPDATE session_violations
      SET disabled_at = now(), updated_at = now()
      WHERE workspace_id = ${workspaceId}
        AND session_token = ${sessionToken}
    `;
    disabled = true;
  }

  // Append audit event (fire-and-forget to avoid delaying the response)
  sql`
    INSERT INTO violation_events (workspace_id, session_token, message_text, violation_count, created_at)
    VALUES (${workspaceId}, ${sessionToken}, ${messageText}, ${newCount}, now())
  `.catch((err: Error) => {
    console.error('[violation-service] Failed to log violation event:', err.message);
  });

  return { violationCount: newCount, disabled };
}
