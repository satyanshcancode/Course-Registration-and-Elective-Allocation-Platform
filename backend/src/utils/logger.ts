export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

type LogMethodLevel = Exclude<LogLevel, 'silent'>;

export type LogMeta = Record<string, unknown>;

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: Number.POSITIVE_INFINITY,
};

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

/** Turns Error instances into plain objects so they survive JSON.stringify. */
function serialiseMeta(meta: LogMeta): string {
  return JSON.stringify(meta, (_key, value: unknown) =>
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value,
  );
}

function formatLine(level: LogMethodLevel, message: string, meta?: LogMeta): string {
  const timestamp = new Date().toISOString();
  const suffix = meta && Object.keys(meta).length > 0 ? ` ${serialiseMeta(meta)}` : '';
  return `${timestamp} ${level.toUpperCase().padEnd(5)} ${message}${suffix}\n`;
}

/**
 * Minimal levelled logger writing single lines to stdout/stderr.
 * Warnings and errors go to stderr so container log drivers can separate them.
 */
export function createLogger(minimumLevel: LogLevel): Logger {
  const write = (level: LogMethodLevel, message: string, meta?: LogMeta): void => {
    if (LEVEL_RANK[level] < LEVEL_RANK[minimumLevel]) {
      return;
    }
    const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
    stream.write(formatLine(level, message, meta));
  };

  return {
    debug: (message, meta) => {
      write('debug', message, meta);
    },
    info: (message, meta) => {
      write('info', message, meta);
    },
    warn: (message, meta) => {
      write('warn', message, meta);
    },
    error: (message, meta) => {
      write('error', message, meta);
    },
  };
}

const configuredLevel = process.env.LOG_LEVEL;

/** Application-wide logger. Level comes from LOG_LEVEL (default: info). */
export const logger: Logger = createLogger(isLogLevel(configuredLevel) ? configuredLevel : 'info');
