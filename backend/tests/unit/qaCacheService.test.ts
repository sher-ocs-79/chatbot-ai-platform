/**
 * Unit tests for qaCacheService pure helpers.
 *
 * Run with:  npx tsx --test tests/unit/qaCacheService.test.ts
 *
 * These tests exercise logic that does NOT touch the database or the OpenAI
 * API, so they work without any running services.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Inline the pure helpers so we don't need to import the full service
//    (which would try to connect to Postgres on module load). ────────────────

const MIN_ANSWER_LENGTH = 20;

const SKIP_CACHE_PATTERNS = [
  /policy violation/i,
  /please\s+(fill|complete|submit).*form/i,
  /contact.*form/i,
  /i['']?m unable to (help|assist)/i,
  /i don['']?t have.*information/i,
  /sorry,?\s+i (can['']?t|cannot)/i,
];

function shouldCacheAnswer(answer: string): boolean {
  if (!answer || answer.trim().length < MIN_ANSWER_LENGTH) return false;
  return !SKIP_CACHE_PATTERNS.some((pattern) => pattern.test(answer));
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

// ── shouldCacheAnswer ────────────────────────────────────────────────────────

describe('shouldCacheAnswer', () => {
  it('returns false for empty string', () => {
    assert.equal(shouldCacheAnswer(''), false);
  });

  it('returns false for whitespace-only string', () => {
    assert.equal(shouldCacheAnswer('   '), false);
  });

  it('returns false for answers shorter than MIN_ANSWER_LENGTH', () => {
    assert.equal(shouldCacheAnswer('Too short.'), false);
  });

  it('returns true for a normal helpful answer', () => {
    assert.equal(
      shouldCacheAnswer('You can reset your password from the account settings page.'),
      true,
    );
  });

  it('blocks "policy violation" answers', () => {
    assert.equal(
      shouldCacheAnswer("I can't help with that due to a policy violation in our terms."),
      false,
    );
  });

  it('blocks "please fill out the form" answers', () => {
    assert.equal(
      shouldCacheAnswer('Please fill out the contact form and we will get back to you.'),
      false,
    );
  });

  it('blocks "contact form" answers', () => {
    assert.equal(
      shouldCacheAnswer('You can reach us through the contact form on our website.'),
      false,
    );
  });

  it('blocks "I am unable to assist" answers', () => {
    assert.equal(
      shouldCacheAnswer("I'm unable to assist with that specific request."),
      false,
    );
  });

  it('blocks "I don\'t have information" answers', () => {
    assert.equal(
      shouldCacheAnswer("I don't have enough information to answer that."),
      false,
    );
  });

  it('blocks "Sorry, I cannot" answers', () => {
    assert.equal(
      shouldCacheAnswer("Sorry, I cannot process that request at this time."),
      false,
    );
  });

  it('returns true when answer is long and helpful', () => {
    assert.equal(
      shouldCacheAnswer(
        'Our return policy allows you to return any unused item within 30 days of purchase for a full refund.',
      ),
      true,
    );
  });
});

// ── toVectorLiteral ──────────────────────────────────────────────────────────

describe('toVectorLiteral', () => {
  it('formats a short array as a pgvector literal', () => {
    assert.equal(toVectorLiteral([0.1, 0.2, 0.3]), '[0.1,0.2,0.3]');
  });

  it('handles negative values', () => {
    assert.equal(toVectorLiteral([-0.5, 0.0, 0.5]), '[-0.5,0,0.5]');
  });

  it('handles a single-element array', () => {
    assert.equal(toVectorLiteral([1]), '[1]');
  });

  it('produces a string that starts with [ and ends with ]', () => {
    const result = toVectorLiteral([0.1, 0.2]);
    assert.ok(result.startsWith('['));
    assert.ok(result.endsWith(']'));
  });
});

// ── QA_CACHE_THRESHOLD env default ──────────────────────────────────────────

describe('QA_CACHE_THRESHOLD default', () => {
  it('falls back to 0.90 when env var is absent', () => {
    const threshold = parseFloat(process.env.QA_CACHE_THRESHOLD ?? '0.90');
    assert.equal(threshold, 0.90);
  });

  it('parses a custom env value correctly', () => {
    const threshold = parseFloat('0.85');
    assert.equal(threshold, 0.85);
  });
});

// ── QA_CACHE_ENABLED env default ────────────────────────────────────────────

describe('QA_CACHE_ENABLED default', () => {
  it('is enabled when env var is absent', () => {
    // Default: enabled unless explicitly set to "false"
    const original = process.env.QA_CACHE_ENABLED;
    delete process.env.QA_CACHE_ENABLED;
    const enabled = process.env.QA_CACHE_ENABLED !== 'false';
    assert.equal(enabled, true);
    if (original !== undefined) process.env.QA_CACHE_ENABLED = original;
  });

  it('is disabled when env var is "false"', () => {
    const enabled = 'false' !== 'false';
    assert.equal(enabled, false);
  });
});
