import { drizzle } from "drizzle-orm/node-postgres";
import pg, { Pool } from "pg";
import * as schema from "./schema";

// Parse the connection strings and force sslmode=verify-full in process.env to suppress
// pg-connection-string deprecation warnings at runtime for any database clients.
const updateSslMode = (envVarName: string) => {
  const value = process.env[envVarName];
  if (!value) return;
  try {
    const parsed = new URL(value);
    const mode = parsed.searchParams.get("sslmode");
    if (mode && ["require", "prefer", "verify-ca"].includes(mode)) {
      parsed.searchParams.set("sslmode", "verify-full");
      process.env[envVarName] = parsed.toString();
    }
  } catch {
    // Ignore invalid URL formats
  }
};

updateSslMode("DATABASE_URL");
updateSslMode("DATABASE_URL_UNPOOLED");

const connectionString =
  process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error(
    "Set DATABASE_URL or DATABASE_URL_UNPOOLED before importing @workspace/db",
  );
}

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});
export const db = drizzle(pool, { schema });

export * from "./schema";
