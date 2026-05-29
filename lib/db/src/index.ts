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

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
