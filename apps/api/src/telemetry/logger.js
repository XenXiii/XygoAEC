// Structured JSON logger. One JSON object per line (stdout by default) so logs are
// machine-parseable by any aggregator. `child` binds base fields (e.g. requestId,
// tenantId) that are merged into every subsequent line. Sink + clock are injectable
// for deterministic tests.
export function createLogger({ sink, clock, base = {} } = {}) {
  const write = sink ?? ((line) => process.stdout.write(`${line}\n`));
  const now = clock ?? (() => new Date().toISOString());

  function emit(level, message, fields = {}) {
    write(JSON.stringify({ ts: now(), level, msg: message, ...base, ...fields }));
  }

  return {
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child(childFields = {}) {
      return createLogger({ sink: write, clock: now, base: { ...base, ...childFields } });
    }
  };
}

export const rootLogger = createLogger();
