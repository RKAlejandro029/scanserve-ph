import { DatabaseSync } from 'node:sqlite';

export function sqliteStore(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS restaurants (slug TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)');
  const read = db.prepare('SELECT version, data FROM restaurants WHERE slug = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO restaurants VALUES (?, 0, ?)');
  const update = db.prepare('UPDATE restaurants SET version = version + 1, data = ? WHERE slug = ? AND version = ?');
  return {
    get(slug) {
      const row = read.get(slug);
      return row ? { version: row.version, state: JSON.parse(row.data) } : null;
    },
    save(slug, version, state) {
      const data = JSON.stringify(state);
      return !!(version === -1 ? insert.run(slug, data) : update.run(data, slug, version)).changes;
    },
    close: () => db.close()
  };
}
