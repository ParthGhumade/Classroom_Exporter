import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
  "https://www.googleapis.com/auth/drive",
  "openid",
  "email",
  "profile",
];

export function getRedirectUri(): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const primaryDomain = domains.split(",")[0].trim();
    return `https://${primaryDomain}/api/auth/callback`;
  }
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) {
    return `https://${devDomain}/api/auth/callback`;
  }
  return "http://localhost:80/api/auth/callback";
}

export function createOAuth2Client(tokens?: Record<string, unknown>) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in environment variables."
    );
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());

  if (tokens) {
    client.setCredentials(tokens as Parameters<typeof client.setCredentials>[0]);
  }

  return client;
}

export function getAuthUrl(): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getUserInfo(tokens: Record<string, unknown>) {
  const client = createOAuth2Client(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data } = await oauth2.userinfo.get();
  return data;
}

export function getClassroomClient(tokens: Record<string, unknown>) {
  const client = createOAuth2Client(tokens);
  return google.classroom({ version: "v1", auth: client });
}

export function getDriveClient(tokens: Record<string, unknown>) {
  const client = createOAuth2Client(tokens);
  return google.drive({ version: "v3", auth: client });
}
