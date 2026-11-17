/**
 * GitHub OAuth 2.0 & Token Verification Endpoint for Flow
 */

export async function handleGitHubAuth(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. GET /api/auth/github/url - Generate real GitHub authorization URL
  if (path.endsWith("/url") && request.method === "GET") {
    const customClientId = url.searchParams.get("client_id");
    const clientId = customClientId || process.env.GITHUB_CLIENT_ID || "";
    const requestedScopes = url.searchParams.get("scopes") || "repo,read:user,user:email";
    
    // Redirect URI must point back to our callback
    const redirectUri = `${url.origin}/api/auth/github/callback`;

    // Construct the real GitHub OAuth URL
    const authParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: requestedScopes,
      state: crypto.randomUUID(),
      allow_signup: "true",
    });

    const authUrl = `https://github.com/login/oauth/authorize?${authParams.toString()}`;

    return new Response(
      JSON.stringify({
        url: authUrl,
        redirectUri,
        hasClientId: Boolean(clientId),
        clientId: clientId ? `${clientId.slice(0, 4)}...` : null,
      }),
      {
        headers: { "content-type": "application/json" },
      }
    );
  }

  // 2. GET /api/auth/github/callback - Handle OAuth redirect and exchange code
  if (path.endsWith("/callback") && request.method === "GET") {
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    const escHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    if (error) {
      const errHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>GitHub Auth Failed</title></head>
          <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f0f11;color:#fff;margin:0;">
            <div style="text-align:center;padding:24px;">
              <h2 style="color:#ef4444;">GitHub Authorization Error</h2>
              <p style="color:#a1a1aa;font-size:14px;">${escHtml(errorDescription || error)}</p>
              <button onclick="window.close()" style="background:#27272a;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;margin-top:16px;">Close Window</button>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GITHUB_OAUTH_ERROR', error: ${JSON.stringify(error)} }, '*');
              }
            </script>
          </body>
        </html>
      `;
      return new Response(errHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    if (!code) {
      return new Response("Missing authorization code", { status: 400 });
    }

    let token = "";
    let userProfile: any = null;

    const clientId = process.env.GITHUB_CLIENT_ID || "";
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || "";

    if (clientId && clientSecret) {
      try {
        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
          }),
        });

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          token = tokenData.access_token || "";

          if (token) {
            const userRes = await fetch("https://api.github.com/user", {
              headers: {
                Authorization: `Bearer ${token}`,
                "User-Agent": "IGseek-Flow",
                Accept: "application/vnd.github.v3+json",
              },
            });
            if (userRes.ok) {
              userProfile = await userRes.json();
            }
          }
        }
      } catch (err) {
        console.error("Failed to exchange GitHub code:", err);
      }
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitHub Authorization Complete</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              background: #09090b;
              color: #f4f4f5;
              margin: 0;
            }
            .card {
              text-align: center;
              background: #18181b;
              border: 1px solid #27272a;
              border-radius: 16px;
              padding: 32px;
              max-width: 360px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            }
            .icon { font-size: 40px; margin-bottom: 12px; }
            h2 { margin: 0 0 8px 0; font-size: 18px; }
            p { font-size: 13px; color: #a1a1aa; margin: 0 0 20px 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✅</div>
            <h2>Authorization Successful</h2>
            <p>Your GitHub account is connected to Flow. This window will close automatically.</p>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'GITHUB_OAUTH_SUCCESS',
                  code: ${JSON.stringify(code)},
                  token: ${JSON.stringify(token || "")},
                  user: ${userProfile ? JSON.stringify(userProfile) : "null"}
                }, '*');
                setTimeout(() => window.close(), 600);
              } else {
                window.location.href = '/app';
              }
            } catch (e) {
              window.close();
            }
          </script>
        </body>
      </html>
    `;

    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // 3. POST /api/auth/github/verify - Verify Personal Access Token or OAuth token
  if (path.endsWith("/verify") && request.method === "POST") {
    try {
      const body = await request.json();
      const token = body?.token?.trim();

      if (!token) {
        return new Response(JSON.stringify({ error: "No token provided" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "IGseek-Flow",
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return new Response(
          JSON.stringify({
            valid: false,
            error: errJson.message || "Invalid or expired GitHub token",
          }),
          { status: 401, headers: { "content-type": "application/json" } }
        );
      }

      const user = await res.json();
      return new Response(
        JSON.stringify({
          valid: true,
          user: {
            login: user.login,
            name: user.name || user.login,
            avatar_url: user.avatar_url,
            html_url: user.html_url,
            public_repos: user.public_repos,
            bio: user.bio,
            followers: user.followers,
          },
        }),
        { headers: { "content-type": "application/json" } }
      );
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message || "Token verification error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return new Response("Not Found", { status: 404 });
}
