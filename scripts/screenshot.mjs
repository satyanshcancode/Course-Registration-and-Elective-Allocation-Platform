/**
 * Captures the documentation screenshots in docs/screenshots/.
 *
 * It drives an already-installed Chrome or Edge in headless mode over the
 * DevTools Protocol, using only what Node itself provides (fetch, WebSocket,
 * child_process). No Playwright, no Puppeteer, no extra dependency for a job
 * that runs a few times per phase.
 *
 *   node scripts/screenshot.mjs                   # every shot in SHOTS
 *   node scripts/screenshot.mjs cart              # only shots whose name matches
 *   node scripts/screenshot.mjs --stage=add-drop  # only the shots that stage can take
 *
 * The dev stack must be running (`npm run docker:up`). Sessions are set as
 * cookies with the same JWT secret the API verifies, so no password is typed.
 *
 * The full set spans two demo stages, so a complete pass is:
 *
 *   npm run docker:demo:reset -- --stage=add-drop
 *   node scripts/screenshot.mjs --stage=add-drop
 *   npm run docker:demo:reset -- --stage=open
 *   node scripts/screenshot.mjs --stage=open
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

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
/** Whose reset link the ActivatePage shots use. Any seeded student will do. */
const RESET_LINK_EMAIL = 'aarav.sharma@university.edu';

/**
 * The newest link e-mailed to `email`, read out of Mailpit exactly as the
 * student would read it out of their inbox. Mailpit delivers in milliseconds,
 * but not synchronously with the API's reply, hence the poll.
 */
async function tokenFromInbox(email, since = Date.now() - 2000) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const inbox = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=1`,
    )
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .catch(() => ({ messages: [] }));
    const latest = inbox.messages?.[0];
    if (latest && Date.parse(latest.Created) + 2000 >= since) {
      const body = await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`).then((r) => r.json());
      const token = /[?&]token=([^\s&"'<>]+)/.exec(`${body.Text ?? ''}${body.HTML ?? ''}`)?.[1];
      if (token) {
        return token;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No e-mail for ${email} in Mailpit at ${MAILPIT_URL}`);
}

/**
 * A real, working password-reset link: asks the public endpoint for one and
 * reads it out of the inbox, exactly as a student would. Nothing is faked, and
 * the token stays single-use.
 */
async function resetTokenFor(email) {
  const before = Date.now();
  const response = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(`forgot-password answered ${response.status}`);
  }
  return tokenFromInbox(email, before);
}

/**
 * A real, unspent invitation link: creates a student through the admin API, as
 * a registrar would, and reads the invitation out of Mailpit. Nothing is faked.
 * The account is removed again as soon as the shot has been taken, so it never
 * reaches a later shot's student list.
 */
const INVITEE = {
  rollNumber: 'CSE26001',
  name: 'Nikhil Rao',
  email: 'nikhil.rao@university.edu',
  program: 'BTECH-CSE',
  semester: 5,
  creditsCompleted: 88,
  expectedGraduationTerm: '2028-SPRING',
  completedCourses: [],
};

async function invitationFor(session) {
  const response = await fetch(`${BASE_URL}/api/admin/students`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      Cookie: `cr_session=${session}`,
    },
    body: JSON.stringify(INVITEE),
  });
  if (!response.ok) {
    throw new Error(`Creating ${INVITEE.rollNumber} answered ${response.status}`);
  }
  return tokenFromInbox(INVITEE.email);
}

/**
 * A ranked draft cart, saved through the same endpoint the cart page uses, so
 * the shot shows real rows rather than an empty state. Only courses the student
 * is actually eligible for, or the page would (rightly) complain.
 */
async function saveCartFor(session, courseCodes) {
  const response = await fetch(`${BASE_URL}/api/preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      Cookie: `cr_session=${session}`,
    },
    body: JSON.stringify({ courseCodes }),
  });
  if (!response.ok) {
    throw new Error(`Saving the draft cart answered ${response.status}`);
  }
}

/**
 * Tall enough that no in-scope page is cut off at either width.
 *
 * The app is light only, so both sizes are light. 1440 is the width the
 * redesign was measured at and the one `scripts/compare-target.py` diffs
 * against docs/redesign/target-ui.png; 390 is the phone.
 */
const SIZES = {
  '1440-light': { w: 1440, h: 1600 },
  '390-light': { w: 390, h: 1500 },
};

/** The two shots every page gets: 1440 and 390, both light. */
function pair(name, shot) {
  return Object.entries(SIZES).map(([suffix, size]) => ({
    ...shot,
    ...size,
    name: `${name}-${suffix}`,
    stage: shot.stage ?? 'add-drop',
  }));
}

/**
 * The final documentation pass: every page of the app, at the two widths
 * DESIGN.md reviews (1440 and 390, both light — the app has no dark theme).
 *
 * `stage` is the demo stage the shot needs, because no single database state
 * shows every page at its best: an editable cart only exists while the window
 * is still open, and results, waitlists and add/drop only exist after the
 * allocation has run. Pass `--stage=<name>` to take just that stage's shots.
 */
const SHOTS = [
  // ---- Public pages ------------------------------------------------------
  ...pair('login', { public: true, path: '/login' }),
  ...pair('forgot-password', { public: true, path: '/forgot-password' }),
  ...pair('reset-password', { public: true, path: 'RESET_LINK' }),
  ...pair('activate', { public: true, path: 'ACTIVATE_LINK' }),
  ...pair('not-found', { public: true, path: '/no-such-page' }),
  ...pair('privacy', { public: true, path: '/privacy' }),
  ...pair('terms', { public: true, path: '/terms' }),

  // ---- Student ------------------------------------------------------------
  ...pair('student-dashboard', { as: 'allocated', path: '/student/dashboard' }),
  // The catalogue and a course page are read while the window is OPEN: that
  // is when "Add to cart" is a real offer rather than a locked receipt.
  ...pair('student-courses', { as: 'aarav', path: '/student/courses', stage: 'open' }),
  ...pair('student-course-detail', {
    as: 'aarav',
    path: '/student/courses/CS401',
    stage: 'open',
  }),
  ...pair('student-eligibility', { as: 'aarav', path: '/student/eligibility' }),
  // The cart is only editable while the window is open; afterwards it is a receipt.
  ...pair('student-cart', {
    as: 'aarav',
    path: '/student/cart',
    stage: 'open',
    cart: ['CS401', 'CS405', 'CS403', 'CS402', 'CS406'],
  }),
  ...pair('student-results', { as: 'waitlisted', path: '/student/results' }),
  ...pair('student-waitlist', { as: 'waitlisted', path: '/student/waitlist' }),
  ...pair('student-add-drop', { as: 'allocated', path: '/student/add-drop' }),
  ...pair('student-history', { as: 'waitlisted', path: '/student/history' }),
  ...pair('student-notifications', { as: 'allocated', path: '/student/notifications' }),
  ...pair('student-account', { as: 'rohan', path: '/student/account' }),

  // ---- Administration -----------------------------------------------------
  ...pair('admin-dashboard', { as: 'admin', path: '/admin/dashboard' }),
  ...pair('admin-courses', { as: 'admin', path: '/admin/courses' }),
  ...pair('admin-course-catalogue', { as: 'admin', path: '/admin/course-catalogue' }),
  ...pair('admin-students', { as: 'admin', path: '/admin/students' }),
  ...pair('admin-student-detail', { as: 'admin', path: '/admin/students/CSE23903' }),
  ...pair('admin-registration-window', { as: 'admin', path: '/admin/registration-window' }),
  ...pair('admin-allocation-runs', { as: 'admin', path: '/admin/allocation-runs' }),
  ...pair('admin-allocation-run', { as: 'admin', path: 'RUN_DETAIL' }),
  ...pair('admin-waitlists', { as: 'admin', path: '/admin/waitlists?course=CS401' }),
  ...pair('admin-team', { as: 'admin', path: '/admin/team' }),
  ...pair('admin-account', { as: 'admin', path: '/admin/account' }),
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
  const args = process.argv.slice(2);
  const stage = args.find((arg) => arg.startsWith('--stage='))?.slice('--stage='.length);
  const filter = args.find((arg) => !arg.startsWith('--'));
  // The documentation shots are tall so nothing is cut off. A comparison round
  // against docs/redesign/target-ui.png wants the viewport the target was
  // actually drawn at, because anything pinned to the bottom of the sidebar
  // moves with the window's height: `--height=1165`.
  const height = Number(args.find((arg) => arg.startsWith('--height='))?.slice('--height='.length));
  const shots = SHOTS.filter(
    (shot) => (!stage || shot.stage === stage) && (!filter || shot.name.includes(filter)),
  ).map((shot) => (height > 0 ? { ...shot, h: height } : shot));
  if (shots.length === 0) {
    throw new Error(`No shot matches ${JSON.stringify({ stage, filter })}`);
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

  const runId = latestRun.rows[0]?.id;
  const pathFor = async (shot) => {
    if (shot.path === 'RESET_LINK') {
      const token = await resetTokenFor(RESET_LINK_EMAIL);
      return `/reset-password?token=${encodeURIComponent(token)}`;
    }
    if (shot.path === 'ACTIVATE_LINK') {
      return `/activate?token=${encodeURIComponent(await invitationFor(sessionFor('admin')))}`;
    }
    if (shot.path !== 'RUN_DETAIL') {
      return shot.path;
    }
    if (!runId) {
      throw new Error('No completed allocation run; run `demo:reset --stage=allocated` first.');
    }
    return `/admin/allocation-runs/${runId}`;
  };

  const generated = { allocated, waitlisted };

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
      // A public page (sign in, activate, reset) has no session by definition.
      const session = shot.public ? null : sessionFor(shot.as);
      if (!shot.public && !session) {
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
          features: [{ name: 'prefers-color-scheme', value: 'light' }],
        });
        if (session) {
          await devtools.send('Network.setCookie', {
            name: 'cr_session',
            value: session,
            url: `${BASE_URL}/api`,
            path: '/api',
            httpOnly: true,
            sameSite: 'Strict',
          });
        }
        if (shot.cart) {
          await saveCartFor(session, shot.cart);
        }
        await devtools.send('Page.navigate', { url: `${BASE_URL}${await pathFor(shot)}` });
        await waitForIdle(devtools);

        const { data } = await devtools.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false,
        });
        const file = join(OUT_DIR, `${shot.name}.png`);
        writeFileSync(file, Buffer.from(data, 'base64'));
        process.stdout.write(`  ${file}  (${shot.w}x${shot.h})\n`);
      } finally {
        devtools.close();
        await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
        if (shot.path === 'ACTIVATE_LINK') {
          // Gone before any later shot counts the students.
          await database.query('DELETE FROM users WHERE email = $1', [INVITEE.email]);
        }
      }
    }
  } finally {
    await database.end();
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
