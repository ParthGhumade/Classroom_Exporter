import { Router } from "express";
import crypto from "crypto";
import { getAuthUrl, exchangeCodeForTokens, getUserInfo } from "../lib/google";
import type { Request, Response } from "express";
import { encryptObject } from "../lib/crypto";

declare module "express-session" {
  interface SessionData {
    tokens?: string | Record<string, unknown>;
    userEmail?: string | null;
    userName?: string | null;
    oauthState?: string;
  }
}

const router = Router();

router.get("/auth/status", async (req: Request, res: Response) => {
  const tokens = req.session.tokens;
  if (!tokens) {
    res.json({ authenticated: false, email: null, name: null });
    return;
  }
  res.json({
    authenticated: true,
    email: req.session.userEmail ?? null,
    name: req.session.userName ?? null,
  });
});

router.get("/auth/url", (req: Request, res: Response) => {
  try {
    const state = crypto.randomBytes(32).toString("hex");
    req.session.oauthState = state;
    const url = getAuthUrl(state);
    res.json({ url });
  } catch (err: unknown) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/auth/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;
  const state = req.query.state as string | undefined;

  const storedState = req.session.oauthState;
  
  if (!state || !storedState || state !== storedState) {
    res.status(400).send("400 Bad Request / Invalid State Parameter (CSRF Warning)");
    return;
  }
  
  delete req.session.oauthState;

  if (error || !code) {
    res.redirect("/?error=auth_failed");
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    req.session.tokens = encryptObject(tokens as Record<string, unknown>);

    try {
      const userInfo = await getUserInfo(tokens as Record<string, unknown>);
      req.session.userEmail = userInfo.email ?? null;
      req.session.userName = userInfo.name ?? null;
    } catch {
      req.session.userEmail = null;
      req.session.userName = null;
    }

    res.redirect("/exports");
  } catch (err: unknown) {
    req.log.error({ err }, "OAuth callback failed");
    res.redirect("/?error=token_exchange_failed");
  }
});

router.delete("/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.json({ status: "ok" });
  });
});

export default router;
