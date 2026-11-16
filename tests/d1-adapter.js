import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

/** Adaptador de testes: SQL real em SQLite; nao e usado no Worker publicado. */
export function createTestDB({ initialize = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  if (initialize) sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  function wrap(sql, args = []) {
    const execute = () => {
      if (args.length > 100) throw new Error(`D1 limite de 100 parâmetros: ${args.length}`);
      const statement = sqlite.prepare(sql);
      const hasRows = statement.columns().length > 0;
      const result = hasRows ? { results: statement.all(...args) } : { results: [] };
      const info = hasRows
        ? (/^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(sql) ? { changes: 0 } : sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid').get())
        : statement.run(...args);
      return { success: true, ...result, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid || 0) } };
    };
    return {
      bind: (...values) => wrap(sql, values),
      all: async () => execute(),
      run: async () => execute(),
      first: async (column) => {
        const row = execute().results[0];
        return row ? column ? row[column] : row : null;
      },
      raw: async () => execute().results.map(row => Object.values(row)),
      _execute: execute
    };
  }
  return {
    prepare: wrap,
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(statement => statement._execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (cause) {
        sqlite.exec('ROLLBACK');
        throw cause;
      }
    },
    exec: async (sql) => { sqlite.exec(sql); return { count: 1, duration: 0 }; },
    sqlite,
    close: () => sqlite.close()
  };
}
