import express, { type Express, type Request, type Response, type NextFunction } from "express";

import session from "express-session";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

// Manually ensure the session table exists because esbuild bundling breaks connect-pg-simple's createTableIfMissing
// Retry up to 5 times with exponential backoff to handle cold-start DB connection delays
async function ensureSessionTable(retries = 5, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "session" (
          "sid" varchar NOT NULL COLLATE "default",
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL,
          CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
        ) WITH (OIDS=FALSE);
        CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
      `);
      return;
    } catch (err) {
      console.error(`Failed to create session table (attempt ${attempt}/${retries}):`, err);
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
}
ensureSessionTable();

const app: Express = express();
app.set("trust proxy", 1);
app.use(helmet());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request): boolean => {
    const url = req.originalUrl?.split("?")[0];
    return (
      url === "/health" ||
      url === "/healthz" ||
      url === "/api/health" ||
      url === "/api/healthz"
    );
  },
});
app.use("/api", apiLimiter);

// Lightweight plain-text logging for health check endpoints to avoid JSON clutter
app.use((req: Request, res: Response, next: NextFunction) => {
  const url = req.url?.split("?")[0];
  const isHealth =
    url === "/health" ||
    url === "/healthz" ||
    url === "/api/health" ||
    url === "/api/healthz";

  if (isHealth) {
    const start = process.hrtime();
    res.on("finish", () => {
      const diff = process.hrtime(start);
      const timeMs = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);
      process.stdout.write(`${req.method} ${url} ${res.statusCode} (${timeMs}ms)\n`);
    });
  }
  next();
});

app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => {
        const url = req.url?.split("?")[0];
        return (
          url === "/health" ||
          url === "/healthz" ||
          url === "/api/health" ||
          url === "/api/healthz"
        );
      },
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

const PgStore = connectPgSimple(session);

app.use(
  session({
    store: new PgStore({ pool, createTableIfMissing: false }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  }),
);

app.use("/api", router);

const frontendDistCandidates = [
  path.resolve(process.cwd(), "artifacts/classroom-exporter/dist/public"),
  path.resolve(process.cwd(), "../classroom-exporter/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
];

const distPath = frontendDistCandidates.find((candidate) => existsSync(candidate));
if (distPath) {
  app.use(express.static(distPath, { maxAge: "1d" }));
  
  app.use("/api", (req: Request, res: Response) => {
    res.status(404).json({ error: "Not Found" });
  });

  app.use((req: Request, res: Response) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  app.use("/api", (req: Request, res: Response) => {
    res.status(404).json({ error: "Not Found" });
  });
}

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  req.log.error({ err }, "Unhandled application error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
