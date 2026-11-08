import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Helper to convert Express request to Web Standard Request
async function toWebRequest(req: express.Request): Promise<Request> {
  const chunks: any[] = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const bodyBuffer = Buffer.concat(chunks);
  const host = req.headers.host || `localhost:${port}`;
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const fullUrl = new URL(req.url, `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val) headers.set(key, Array.isArray(val) ? val.join(',') : val);
  }

  return new Request(fullUrl.toString(), {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method || '') ? undefined : bodyBuffer,
  });
}

// Helper to stream Web Standard Response to Express response
async function pipeWebResponse(webRes: Response, res: express.Response) {
  res.status(webRes.status);
  webRes.headers.forEach((val, key) => {
    res.setHeader(key, val);
  });

  if (webRes.body) {
    const reader = webRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } finally {
      res.end();
    }
  } else {
    res.end();
  }
}

let viteDevServer: any = null;

// Route handlers for backend API
app.post('/api/chat', async (req, res) => {
  try {
    let handleChatPost: (r: Request) => Promise<Response>;
    if (viteDevServer) {
      const mod = await viteDevServer.ssrLoadModule('/src/routes/api/chat.ts');
      handleChatPost = mod.handleChatPost;
    } else {
      const mod = await import('./src/routes/api/chat.js').catch(() => import('./src/routes/api/chat.ts'));
      handleChatPost = mod.handleChatPost;
    }

    const webReq = await toWebRequest(req);
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
    let handleMemoryRequest: (r: Request) => Promise<Response>;
    if (viteDevServer) {
      const mod = await viteDevServer.ssrLoadModule('/src/routes/api/memory.ts');
      handleMemoryRequest = mod.handleMemoryRequest;
    } else {
      const mod = await import('./src/routes/api/memory.js').catch(() => import('./src/routes/api/memory.ts'));
      handleMemoryRequest = mod.handleMemoryRequest;
    }

    const webReq = await toWebRequest(req);
    const webRes = await handleMemoryRequest(webReq);
    await pipeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('API /api/memory error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
});

async function startServer() {
  if (!isProduction) {
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
    console.log(`Server running on http://0.0.0.0:${port} (${isProduction ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
