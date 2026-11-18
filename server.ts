import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Helper to convert Express request to Web Standard Request safely without hanging
async function toWebRequest(req: express.Request): Promise<Request> {
  let bodyBuffer: Buffer;

  if (['GET', 'HEAD'].includes(req.method || '')) {
    bodyBuffer = Buffer.alloc(0);
  } else if ((req as any).rawBody) {
    bodyBuffer = Buffer.isBuffer((req as any).rawBody)
      ? (req as any).rawBody
      : Buffer.from((req as any).rawBody);
  } else if ((req as any).body && typeof (req as any).body === 'object' && Object.keys((req as any).body).length > 0) {
    bodyBuffer = Buffer.from(JSON.stringify((req as any).body));
  } else if (req.readableEnded || (req as any)._readableState?.ended) {
    bodyBuffer = Buffer.alloc(0);
  } else {
    // Read from incoming stream with safety timeout so req NEVER hangs
    bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let resolved = false;

      let timer: ReturnType<typeof setTimeout> | null = null;
      const resetIdleTimer = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(finish, 15000);
      };

      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('error', onError);
        resolve(Buffer.concat(chunks));
      };

      const onData = (chunk: any) => {
        resetIdleTimer();
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      };
      const onEnd = () => finish();
      const onError = (err: any) => {
        if (resolved) return;
        resolved = true;
        if (timer) clearTimeout(timer);
        reject(err);
      };

      resetIdleTimer(); // Idle timeout only; resets as chunks arrive

      req.on('data', onData);
      req.on('end', onEnd);
      req.on('error', onError);

      if (req.readableEnded) {
        finish();
      }
    });
  }

  const host = req.headers.host || `localhost:${port}`;
  const rawProto = req.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(rawProto) ? rawProto[0] : rawProto || 'http').split(',')[0].trim() || 'http';
  const fullUrl = new URL(req.url, `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val) headers.set(key, Array.isArray(val) ? val.join(',') : val);
  }

  return new Request(fullUrl.toString(), {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : (bodyBuffer.length > 0 ? new Uint8Array(bodyBuffer) : undefined),
  });
}

// Helper to stream Web Standard Response to Express response
async function pipeWebResponse(webRes: Response, res: express.Response) {
  res.status(webRes.status);
  webRes.headers.forEach((val, key) => {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection') return;
    res.setHeader(key, val);
  });

  const contentType = webRes.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    if (webRes.body) {
      const reader = webRes.body.getReader();
      let clientClosed = false;
      const onClose = () => {
        clientClosed = true;
        void reader.cancel().catch(() => {});
      };
      res.on('close', onClose);
      try {
        while (!clientClosed) {
          const { done, value } = await reader.read();
          if (done || clientClosed) break;
          if (!res.writableEnded) {
            res.write(value);
          }
        }
      } catch {
        // ignore broken pipe on client abort
      } finally {
        res.off('close', onClose);
        if (!res.writableEnded) res.end();
      }
    } else {
      if (!res.writableEnded) res.end();
    }
  } else {
    const arrayBuf = await webRes.arrayBuffer();
    if (!res.writableEnded) res.send(Buffer.from(arrayBuf));
  }
}

let viteDevServer: any = null;
const isBundledServer = path.extname(__filename) !== '.ts';

// Route handlers for backend API
app.post('/api/chat', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);

    let handleChatPost: (r: Request) => Promise<Response>;
    if (viteDevServer) {
      const mod = await viteDevServer.ssrLoadModule('/src/routes/api/chat.ts');
      handleChatPost = mod.handleChatPost;
    } else {
      const mod = await import('./src/routes/api/chat.ts');
      handleChatPost = mod.handleChatPost;
    }

    const webRes = await handleChatPost(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/chat error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.all('/api/memory', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);

    let handleMemoryRequest: (r: Request) => Promise<Response>;
    if (viteDevServer) {
      const mod = await viteDevServer.ssrLoadModule('/src/routes/api/memory.ts');
      handleMemoryRequest = mod.handleMemoryRequest;
    } else {
      const mod = await import('./src/routes/api/memory.ts');
      handleMemoryRequest = mod.handleMemoryRequest;
    }

    const webRes = await handleMemoryRequest(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/memory error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.all('/api/flow', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);

    let handleFlowRequest: (r: Request) => Promise<Response>;
    if (viteDevServer) {
      const mod = await viteDevServer.ssrLoadModule('/src/routes/api/flow.ts');
      handleFlowRequest = mod.handleFlowRequest;
    } else {
      const mod = await import('./src/routes/api/flow.ts');
      handleFlowRequest = mod.handleFlowRequest;
    }

    const webRes = await handleFlowRequest(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/flow error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.all(['/api/auth/github', '/api/auth/github/*'], async (req, res) => {
  try {
    const webReq = await toWebRequest(req);

    let handleGitHubAuth: (r: Request) => Promise<Response>;
    if (viteDevServer) {
      const mod = await viteDevServer.ssrLoadModule('/src/routes/api/auth-github.ts');
      handleGitHubAuth = mod.handleGitHubAuth;
    } else {
      const mod = await import('./src/routes/api/auth-github.ts');
      handleGitHubAuth = mod.handleGitHubAuth;
    }

    const webRes = await handleGitHubAuth(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/auth/github error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

app.get('/api/legal', async (req, res) => {
  try {
    const webReq = await toWebRequest(req);

    let handleLegalRequest: (r: Request) => Promise<Response>;
    if (viteDevServer) {
      const mod = await viteDevServer.ssrLoadModule('/src/routes/api/legal.ts');
      handleLegalRequest = mod.handleLegalRequest;
    } else {
      const mod = await import('./src/routes/api/legal.ts');
      handleLegalRequest = mod.handleLegalRequest;
    }

    const webRes = await handleLegalRequest(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/legal error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

async function startServer() {
  if (!isProduction && !isBundledServer) {
    const { createServer } = await import('vite');
    viteDevServer = await createServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(viteDevServer.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port} (${isProduction || isBundledServer ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
