import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

export const pool = connectionString
  ? new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
    })
  : (null as unknown as Pool);

export const db = pool ? drizzle(pool, { schema }) : (null as unknown as ReturnType<typeof drizzle>);

export * from "./schema";
