// D1-shaped wrapper around a better-sqlite3 database so load-from-d1 and
// the Worker fetch handler can run in Node tests against data/lcms.db.

export function sqliteAsD1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const api = {
        bind(...params) {
          return {
            bind: (...more) => api.bind(...params, ...more),
            all: async () => ({ results: stmt.all(...params) }),
            first: async () => stmt.get(...params) ?? null
          };
        },
        all: async () => ({ results: stmt.all() }),
        first: async () => stmt.get() ?? null
      };
      return api;
    }
  };
}
