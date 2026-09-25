/**
 * Captures the documentation screenshots in docs/screenshots/.
 *
 * It drives an already-installed Chrome or Edge in headless mode over the
 * DevTools Protocol, using only what Node itself provides (fetch, WebSocket,
 * child_process). No Playwright, no Puppeteer, no extra dependency for a job
 * that runs a few times per phase.
 *
 *   node scripts/screenshot.mjs                 # every shot in SHOTS
 *   node scripts/screenshot.mjs cart            # only shots whose name matches
 *
 * The dev stack must be running (`npm run docker:up`). Sessions are set as
 * cookies with the same JWT secret the API verifies, so no password is typed.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

const BASE_URL = process.env.SCREENSHOT_URL ?? 'http://localhost:5173';
const OUT_DIR = 'docs/screenshots';
const PORT = 9333;

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

/** Who each shot is signed in as; ids come from the seeded database. */
const ACCOUNTS = {
  aarav: { role: 'STUDENT', email: 'aarav.sharma@university.edu' },
  priya: { role: 'STUDENT', email: 'priya.nair@university.edu' },
  meera: { role: 'STUDENT', email: 'meera.iyer@university.edu' },
  rohan: { role: 'STUDENT', email: 'rohan.verma@university.edu' },
  admin: { role: 'ADMIN', email: 'admin@university.edu' },
};

/** name → what to capture. Widths follow DESIGN.md: 1280, 820, 390. */
const SHOTS = [
  { name: 'student-cart-1280-light', as: 'draft', path: '/student/cart', w: 1280, h: 900 },
  { name: 'student-cart-820-light', as: 'draft', path: '/student/cart', w: 820, h: 1000 },
  { name: 'student-cart-390-dark', as: 'draft', path: '/student/cart', w: 390, h: 844, dark: true },
  { name: 'student-receipt-1280-light', as: 'priya', path: '/student/cart', w: 1280, h: 900 },
  {
    name: 'catalogue-cart-actions-1280-light',
    as: 'draft',
    path: '/student/courses?eligibleOnly=true',
    w: 1280,
    h: 1000,
  },
  {
    name: 'student-dashboard-cart-1280-light',
    as: 'priya',
    path: '/student/dashboard',
    w: 1280,
    h: 900,
  },
];

function findBrowser() {
  const found = BROWSERS.find((path) => existsSync(path));
  if (!found) {
    throw new Error(`No Chrome or Edge found. Looked in:\n  ${BROWSERS.join('\n  ')}`);
  }
  return found;
}

function readEnvFile() {
  const env = {};
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const separator = line.indexOf('=');
    if (separator > 0 && !line.startsWith('#')) {
      env[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return env;
}

/** One CDP connection, with promise-based command sending. */
class DevTools {
  #socket;
  #nextId = 1;
  #pending = new Map();

  static async attach(webSocketUrl) {
    const client = new DevTools();
    client.#socket = new WebSocket(webSocketUrl);
    client.#socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const settle = client.#pending.get(message.id);
      if (settle) {
        client.#pending.delete(message.id);
        if (message.error) {
          settle.reject(new Error(message.error.message));
        } else {
          settle.resolve(message.result);
        }
      }
    });
    await new Promise((resolve, reject) => {
      client.#socket.addEventListener('open', resolve, { once: true });
      client.#socket.addEventListener('error', reject, { once: true });
    });
    return client;
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.#socket.close();
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls until the page is really there: a lazy route's chunk has to compile
 * on the dev server first, so `readyState === 'complete'` arrives long before
 * anything worth photographing does. Waits for an <h1> and for the Suspense
 * and skeleton placeholders to be gone.
 */
async function waitForIdle(devtools, settleMs = 1200) {
  const ready = `(() => {
    const main = document.querySelector('main');
    if (!main || !main.querySelector('h1')) return false;
    if (main.textContent.includes('Loading page')) return false;
    if (main.querySelector('[aria-busy="true"], [aria-hidden="true"] [class*="skeleton" i]')) return false;
    return true;
  })()`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const { result } = await devtools.send('Runtime.evaluate', {
      expression: ready,
      returnByValue: true,
    });
    if (result.value) {
      await wait(settleMs);
      return;
    }
    await wait(250);
  }
  throw new Error('The page never finished loading');
}

async function main() {
  const filter = process.argv[2];
  const shots = filter ? SHOTS.filter((shot) => shot.name.includes(filter)) : SHOTS;
  if (shots.length === 0) {
    throw new Error(`No shot matches "${filter}"`);
  }

  const env = readEnvFile();
  const secret = env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in .env');
  }

  // Look up the user ids by e-mail through the API's own database.
  const { Client } = require('pg');
  const database = new Client({
    connectionString: (env.DATABASE_URL ?? '').replace('@postgres:', '@localhost:'),
  });
  await database.connect();
  const emails = [...new Set(Object.values(ACCOUNTS).map((account) => account.email))];
  const { rows } = await database.query('SELECT id, email FROM users WHERE email = ANY($1)', [
    emails,
  ]);
  // A generated student with a draft cart, for the editable-cart shots.
  const draft = await database.query(
    `SELECT ps.student_id AS id FROM preference_submissions ps
      WHERE ps.status = 'DRAFT' AND EXISTS (SELECT 1 FROM preference_items pi WHERE pi.submission_id = ps.id)
      ORDER BY ps.created_at DESC LIMIT 1`,
  );
  await database.end();

  const idByEmail = new Map(rows.map((row) => [row.email, row.id]));
  const sessionFor = (as) => {
    if (as === 'draft') {
      const id = draft.rows[0]?.id;
      if (!id) {
        throw new Error('No student has a draft cart; save one first.');
      }
      return jwt.sign({ role: 'STUDENT' }, secret, { subject: id, expiresIn: '1h' });
    }
    const account = ACCOUNTS[as];
    const id = idByEmail.get(account.email);
    if (!id) {
      throw new Error(`${account.email} is not in the database; run the seed first.`);
    }
    return jwt.sign({ role: account.role }, secret, { subject: id, expiresIn: '1h' });
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'cr-shots-'));
  const browser = spawn(
    findBrowser(),
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    // The debugging port takes a moment to listen.
    let version;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
        break;
      } catch {
        await wait(250);
      }
    }
    if (!version) {
      throw new Error('The browser never opened its debugging port');
    }

    for (const shot of shots) {
      const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, {
        method: 'PUT',
      }).then((r) => r.json());
      const devtools = await DevTools.attach(target.webSocketDebuggerUrl);
      try {
        await devtools.send('Page.enable');
        await devtools.send('Network.enable');
        await devtools.send('Emulation.setDeviceMetricsOverride', {
          width: shot.w,
          height: shot.h,
          deviceScaleFactor: 1,
          mobile: shot.w < 768,
        });
        await devtools.send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: shot.dark ? 'dark' : 'light' }],
        });
        await devtools.send('Network.setCookie', {
          name: 'cr_session',
          value: sessionFor(shot.as),
          url: `${BASE_URL}/api`,
          path: '/api',
          httpOnly: true,
          sameSite: 'Strict',
        });
        await devtools.send('Page.navigate', { url: `${BASE_URL}${shot.path}` });
        await waitForIdle(devtools);

        const { data } = await devtools.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
        });
        const file = join(OUT_DIR, `${shot.name}.png`);
        writeFileSync(file, Buffer.from(data, 'base64'));
        process.stdout.write(`  ${file}  (${shot.w}x${shot.h}, ${shot.dark ? 'dark' : 'light'})\n`);
      } finally {
        devtools.close();
        await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
      }
    }
  } finally {
    browser.kill();
    await wait(500);
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
