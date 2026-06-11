import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  // Teacher scope: list all students' coursework
  "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
  // Student scope: list own assigned coursework
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
  // Read access to read attachments, and File access to write new copies
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "email",
  "profile",
];

export function getRedirectUri(): string {
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    return `${appUrl.replace(/\/+$/, "")}/api/auth/callback`;
  }
  return "http://localhost:80/api/auth/callback";
}

export function createOAuth2Client(tokens?: Record<string, unknown>, onTokens?: (tokens: any) => void) {
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

  if (onTokens) {
    client.on("tokens", onTokens);
  }

  return client;
}

export function getAuthUrl(state?: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    ...(state ? { state } : {})
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

export function getClassroomClient(tokens: Record<string, unknown>, onTokens?: (tokens: any) => void) {
  const client = createOAuth2Client(tokens, onTokens);
  return google.classroom({ version: "v1", auth: client });
}

export function getDriveClient(tokens: Record<string, unknown>, onTokens?: (tokens: any) => void) {
  const client = createOAuth2Client(tokens, onTokens);
  return google.drive({ version: "v3", auth: client });
}
