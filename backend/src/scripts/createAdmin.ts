/**
 * CLI: `npm run admin:create`
 *
 * Creates the first administrator account, interactively. This is the production
 * bootstrap: a production database starts empty apart from the migrations —
 * the seed and every demo script refuse to run there — so without this there
 * would be nobody to sign in and invite anybody else.
 *
 * It is the ONLY way an account is created without an invitation, which is why
 * it is a command on the server rather than an endpoint: it needs a shell on the
 * machine, and it writes an audit row saying an administrator was created by CLI.
 *
 * Unlike the seed, it runs in production on purpose and never deletes anything.
 */
import { assessPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@course-reg/shared';
import bcrypt from 'bcryptjs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import type { Pool } from 'pg';
import { databaseEnvSchema, loadEnv } from '../config/env.js';
import { PASSWORD_HASH_ROUNDS } from '../config/session.js';
import { createPool } from '../database/pool.js';
import { withTransaction } from '../database/transaction.js';
import { logger } from '../utils/logger.js';

export const ADMIN_CREATED_ACTION = 'ADMIN_CREATED';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The terminal readline writes to, which can be silenced.
 *
 * `readline` has no hidden-input mode, so echoing is turned off around the
 * password questions instead: a password must not reach a terminal scrollback,
 * a screen share or a session recording. The prompt is written straight to
 * stdout so it stays visible while the answer does not.
 */
class MutableTerminal extends Writable {
  muted = false;

  /**
   * False when stdin is a pipe or a file. Provisioning scripts feed the answers
   * in, and readline must then read the stream line by line rather than drive a
   * terminal — with `terminal: true` a pipe is consumed at once and the
   * interface closes before the first question is asked.
   */
  readonly interactive = process.stdin.isTTY === true;

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.muted) {
      process.stdout.write(chunk, encoding);
    }
    callback();
  }
}

/**
 * One prompt, one line of input.
 *
 * Lines are pulled from readline's async iterator rather than asked for with
 * `question()`, because that also works when stdin is a PIPE: a provisioning
 * script feeding the answers in closes the stream as soon as it has written
 * them, and `question()` throws once the interface has closed, while the
 * iterator still yields the lines readline has already buffered.
 *
 * `hidden` silences the echo while a password is typed, so it does not reach a
 * terminal scrollback, a screen share or a session recording. There is nothing
 * to silence for a pipe, which never echoed.
 */
async function askLine(
  lines: AsyncIterator<string>,
  terminal: MutableTerminal,
  prompt: string,
  hidden = false,
): Promise<string> {
  process.stdout.write(prompt);
  const hide = hidden && terminal.interactive;
  if (hide) {
    terminal.muted = true;
  }
  try {
    const next = await lines.next();
    if (next.done === true) {
      throw new Error('Input ended before every question was answered.');
    }
    return next.value;
  } finally {
    terminal.muted = false;
    if (hide) {
      // The Enter keystroke was swallowed with everything else.
      process.stdout.write('\n');
    }
  }
}

interface Answers {
  email: string;
  password: string;
}

async function ask(lines: AsyncIterator<string>, terminal: MutableTerminal): Promise<Answers> {
  let email = '';
  while (email === '') {
    const answer = (await askLine(lines, terminal, 'Administrator e-mail: ')).trim().toLowerCase();
    if (EMAIL_PATTERN.test(answer) && answer.length <= 254) {
      email = answer;
    } else {
      process.stdout.write('  That is not a valid e-mail address.\n');
    }
  }

  let password = '';
  while (password === '') {
    const first = await askLine(
      lines,
      terminal,
      `Password (at least ${PASSWORD_MIN_LENGTH} characters): `,
      true,
    );
    const assessment = assessPassword(first);
    if (!assessment.acceptable || first.length > PASSWORD_MAX_LENGTH) {
      process.stdout.write(
        `  ${assessment.suggestions[0] ?? 'That password is too long.'}\n`,
      );
      continue;
    }
    const again = await askLine(lines, terminal, 'Repeat the password: ', true);
    if (first !== again) {
      process.stdout.write('  Those did not match.\n');
      continue;
    }
    // Advisory, exactly as it is in the browser: length is the only hard rule.
    if (assessment.strength !== 'strong') {
      for (const suggestion of assessment.suggestions) {
        process.stdout.write(`  Note: ${suggestion}\n`);
      }
    }
    password = first;
  }

  return { email, password };
}

export async function createAdminAccount(
  pool: Pool,
  answers: Answers,
  rounds = PASSWORD_HASH_ROUNDS,
): Promise<string> {
  const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [answers.email]);
  if (existing.rowCount !== 0) {
    throw new Error(`An account already exists for ${answers.email}.`);
  }

  const passwordHash = await bcrypt.hash(answers.password, rounds);
  return withTransaction(pool, async (client) => {
    // password_changed_at defaults to now(), so the account starts with a clean
    // session cut-off like any other.
    const result = await client.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'ADMIN') RETURNING id`,
      [answers.email, passwordHash],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error('Failed to create the administrator account');
    }
    // Self-actored: there is no other administrator to attribute it to, and the
    // row is what records that this account arrived through the CLI.
    // entity_id is TEXT while actor_user_id is UUID, so the shared parameter is
    // cast explicitly: without it PostgreSQL cannot deduce one type for $1.
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, new_value)
       VALUES ($1::uuid, $2, 'user', $1::text, $3)`,
      [id, ADMIN_CREATED_ACTION, JSON.stringify({ email: answers.email, via: 'admin:create' })],
    );
    return id;
  });
}

async function main(): Promise<void> {
  const env = loadEnv(databaseEnvSchema);
  const terminal = new MutableTerminal();
  const rl = createInterface({
    input: process.stdin,
    output: terminal,
    terminal: terminal.interactive,
  });
  const lines = rl[Symbol.asyncIterator]();
  const pool = createPool(env.DATABASE_URL);

  try {
    const count = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users WHERE role = 'ADMIN'`,
    );
    const existing = Number(count.rows[0]?.count ?? 0);
    process.stdout.write(
      existing === 0
        ? '\nNo administrator exists yet. Creating the first one.\n\n'
        : `\nThere ${existing === 1 ? 'is' : 'are'} already ${existing} administrator ${existing === 1 ? 'account' : 'accounts'}. Creating another.\n\n`,
    );

    const answers = await ask(lines, terminal);
    await createAdminAccount(pool, answers);
    process.stdout.write(
      `\nAdministrator created: ${answers.email}\nSign in at /login and invite students from /admin/students.\n\n`,
    );
  } finally {
    rl.close();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  logger.error('admin:create failed', { error });
  process.exitCode = 1;
});
