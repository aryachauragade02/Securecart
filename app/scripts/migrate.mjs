// Applies migrations/*.sql in order, once each. Safe to run on every start.
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const url = process.env.DATABASE_URL ?? 'postgres://securecart:securecart@localhost:5432/securecart'
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'migrations')

async function connectWithRetry() {
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString: url })
    try {
      await client.connect()
      return client
    } catch (err) {
      if (attempt >= 30) throw err
      console.log(`database not ready (${err.code ?? err.message}), retrying...`)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

const client = await connectWithRetry()
try {
  await client.query('SELECT pg_advisory_lock(7310)')
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version))
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue
    console.log(`applying ${file}`)
    await client.query('BEGIN')
    try {
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'))
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  }
  console.log('migrations up to date')
} finally {
  await client.query('SELECT pg_advisory_unlock(7310)').catch(() => {})
  await client.end()
}
