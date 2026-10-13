export const config = {
  runtime: "nodejs",
};

export default async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight if called from any origin
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = request.headers.get("authorization");
  if (
    !authHeader ||
    !authHeader.trim() ||
    !authHeader.trim().toLowerCase().startsWith("bearer ") ||
    authHeader.trim().slice(7).trim().length === 0
  ) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: Missing or invalid Authorization header" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const url = new URL(request.url);
  const fileId = url.searchParams.get("fileId");
  const exportMime = url.searchParams.get("exportMime");

  const FILE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
  if (!fileId || !FILE_ID_REGEX.test(fileId)) {
    return new Response(
      JSON.stringify({ error: "Bad Request: Invalid or missing fileId parameter" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const targetUrl = exportMime
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId
      )}/export?mimeType=${encodeURIComponent(exportMime)}`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        fileId
      )}?alt=media&supportsAllDrives=true&acknowledgeAbuse=true`;

  try {
    // Attempt initial request with manual redirect handling to prevent auth header conflicts on CDN redirect
    let driveRes = await fetch(targetUrl, {
      headers: {
        Authorization: authHeader,
      },
      redirect: "manual",
    });

    // If Google redirects to googleusercontent.com CDN (302/303/307)
    if (driveRes.status === 302 || driveRes.status === 303 || driveRes.status === 307) {
      const redirectLocation = driveRes.headers.get("location");
      if (redirectLocation) {
        // Fetch the signed CDN location without Authorization header to avoid auth collision
        driveRes = await fetch(redirectLocation, {
          redirect: "follow",
        });
      }
    }

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      return new Response(errText, {
        status: driveRes.status,
        headers: {
          "Content-Type": driveRes.headers.get("content-type") || "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      driveRes.headers.get("content-type") || "application/octet-stream"
    );
    const contentLength = driveRes.headers.get("content-length");
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }
    responseHeaders.set("Cache-Control", "private, no-cache, no-store");
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new Response(driveRes.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to stream file from Google Drive" }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
