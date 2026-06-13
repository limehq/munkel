type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(event: string, ctx?: Record<string, unknown>): void;
  info(event: string, ctx?: Record<string, unknown>): void;
  warn(event: string, ctx?: Record<string, unknown>): void;
  error(event: string, ctx?: Record<string, unknown>): void;
}

export function createLogger(svc: string): Logger {
  function emit(level: Level, event: string, ctx?: Record<string, unknown>): void {
    const entry = {
      ts: new Date().toISOString(),
      level,
      svc,
      event,
      ...ctx,
    };
    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (event, ctx) => emit('debug', event, ctx),
    info:  (event, ctx) => emit('info',  event, ctx),
    warn:  (event, ctx) => emit('warn',  event, ctx),
    error: (event, ctx) => emit('error', event, ctx),
  };
}
