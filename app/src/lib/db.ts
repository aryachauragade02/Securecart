import pg from 'pg'
import { env } from './env'

// Bigint columns (e.g. order numbers) come back as strings by default; they fit in a JS number here.
pg.types.setTypeParser(20, (v) => Number(v))

const g = globalThis as unknown as { __securecartPool?: pg.Pool }
export const pool = g.__securecartPool ?? new pg.Pool({ connectionString: env.databaseUrl, max: 10 })
g.__securecartPool = pool

export type Db = pg.Pool | pg.PoolClient

/** Every query in the app goes through parameter placeholders ($1, $2...): never string concatenation. */
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = [], db: Db = pool): Promise<T[]> {
  const res = await db.query(text, params)
  return res.rows as T[]
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = [], db: Db = pool): Promise<T | null> {
  const rows = await query<T>(text, params, db)
  return rows[0] ?? null
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
