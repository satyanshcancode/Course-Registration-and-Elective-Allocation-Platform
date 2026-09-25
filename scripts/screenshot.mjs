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
  // Phase 9 — waitlists.
  {
    name: 'student-waitlist-1280-light',
    as: 'waitlisted',
    path: '/student/waitlist',
    w: 1280,
    h: 1000,
  },
  {
    name: 'student-waitlist-390-dark',
    as: 'waitlisted',
    path: '/student/waitlist',
    w: 390,
    h: 900,
    dark: true,
  },
  {
    name: 'admin-waitlists-1280-light',
    as: 'admin',
    path: '/admin/waitlists?course=CS401',
    w: 1280,
    h: 1200,
  },
  {
    name: 'admin-waitlists-390-dark',
    as: 'admin',
    path: '/admin/waitlists?course=CS401',
    w: 390,
    h: 1100,
    dark: true,
  },

  // Phase 8 — allocation.
  {
    name: 'student-results-1280-light',
    as: 'allocated',
    path: '/student/results',
    w: 1280,
    h: 1000,
  },
  {
    name: 'student-results-820-dark',
    as: 'waitlisted',
    path: '/student/results',
    w: 820,
    h: 1100,
    dark: true,
  },
  { name: 'student-results-390-light', as: 'waitlisted', path: '/student/results', w: 390, h: 900 },
  {
    name: 'admin-allocation-runs-1280-light',
    as: 'admin',
    path: '/admin/allocation-runs',
    w: 1280,
    h: 1100,
  },
  {
    name: 'admin-allocation-run-1280-dark',
    as: 'admin',
    path: 'RUN_DETAIL',
    w: 1280,
    h: 1200,
    dark: true,
  },
  { name: 'admin-allocation-run-390-light', as: 'admin', path: 'RUN_DETAIL', w: 390, h: 900 },
  {
    name: 'admin-dashboard-allocation-1280-light',
    as: 'admin',
    path: '/admin/dashboard',
    w: 1280,
    h: 900,
  },
  {
    name: 'student-dashboard-result-820-light',
    as: 'allocated',
    path: '/student/dashboard',
    w: 820,
    h: 1000,
  },

  // Phase 7 — the cart.
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
  // Every loading placeholder in this app is a Skeleton, and a Skeleton is
  // the only thing that runs the `pulse` animation — so "no pulse" is a
  // reliable "finished", whatever the page's own class names happen to be.
  // CSS Modules hashes keyframe names too, so match on a substring rather
  // than on `pulse` exactly.
  const ready = `(() => {
    const main = document.querySelector('main');
    if (!main || !main.querySelector('h1')) return false;
    if (main.textContent.includes('Loading page')) return false;
    if (main.querySelector('[aria-busy="true"]')) return false;
    return ![...main.querySelectorAll('*')].some(
      (el) => getComputedStyle(el).animationName.includes('pulse'),
    );
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
  // One student who got a seat, and one who is waiting well down a queue:
  // the two shapes the results page has to handle.
  const allocated = await database.query(
    `SELECT student_id AS id FROM enrollments WHERE status = 'ACTIVE' ORDER BY enrolled_at LIMIT 1`,
  );
  const waitlisted = await database.query(
    `SELECT student_id AS id FROM waitlist_entries
      WHERE status = 'WAITING' AND position BETWEEN 5 AND 12 ORDER BY position LIMIT 1`,
  );
  const latestRun = await database.query(
    `SELECT id FROM allocation_runs WHERE status = 'COMPLETED' ORDER BY finished_at DESC LIMIT 1`,
  );
  await database.end();

  const runId = latestRun.rows[0]?.id;
  const pathFor = (shot) => {
    if (shot.path !== 'RUN_DETAIL') {
      return shot.path;
    }
    if (!runId) {
      throw new Error('No completed allocation run; run `demo:reset --stage=allocated` first.');
    }
    return `/admin/allocation-runs/${runId}`;
  };

  const generated = { draft, allocated, waitlisted };

  const idByEmail = new Map(rows.map((row) => [row.email, row.id]));
  /**
   * Null when this demo stage has nobody in that situation — an allocated
   * database has no editable cart, for instance. Those shots are skipped with
   * a note rather than failing the whole run.
   */
  const sessionFor = (as) => {
    if (as in generated) {
      const id = generated[as].rows[0]?.id;
      return id ? jwt.sign({ role: 'STUDENT' }, secret, { subject: id, expiresIn: '1h' }) : null;
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
      const session = sessionFor(shot.as);
      if (!session) {
        process.stdout.write(`  (skipped ${shot.name}: no "${shot.as}" student in this stage)
`);
        continue;
      }
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
          value: session,
          url: `${BASE_URL}/api`,
          path: '/api',
          httpOnly: true,
          sameSite: 'Strict',
        });
        await devtools.send('Page.navigate', { url: `${BASE_URL}${pathFor(shot)}` });
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
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Windows can still hold the profile's files for a moment after the
      // browser exits. The screenshots are already written; a leftover temp
      // directory is not worth failing the run for.
      process.stdout.write(`  (left ${profile} behind; the OS was still holding it)
`);
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? String(error)}\n`);
  process.exitCode = 1;
});
