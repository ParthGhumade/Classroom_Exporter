import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const connectionString =
  process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error(
    "Set DATABASE_URL or DATABASE_URL_UNPOOLED before importing @workspace/db",
  );
}

// Parse the connection string and ensure sslmode=verify-full to suppress
// pg-connection-string v3 deprecation warning while keeping rejectUnauthorized: false
// for Render's managed Postgres (self-signed certs).
const parsedUrl = new URL(connectionString);
if (!parsedUrl.searchParams.has("sslmode")) {
  parsedUrl.searchParams.set("sslmode", "verify-full");
}

export const pool = new Pool({
  connectionString: parsedUrl.toString(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});
export const db = drizzle(pool, { schema });

export * from "./schema";
