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

const app: Express = express();
app.set("trust proxy", 1);
app.use(helmet());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(apiLimiter);

app.use(
  pinoHttp({
    logger,
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
    store: new PgStore({ pool, createTableIfMissing: true }),
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
