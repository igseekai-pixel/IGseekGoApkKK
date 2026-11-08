import { handleChatPost } from '../src/routes/api/chat';

export const config = {
  maxDuration: 60,
};

export default async function handler(req: any, res?: any) {
  // Edge runtime or Web Standard Request
  if (req instanceof Request || (req?.headers && typeof req.headers.get === 'function')) {
    return handleChatPost(req);
  }

  // Node runtime on Vercel
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const fullUrl = new URL(req.url, `${protocol}://${host}`);

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val) headers.set(key, Array.isArray(val) ? val.join(',') : String(val));
    }

    let bodyData: any = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
      if (typeof req.body === 'object') {
        bodyData = JSON.stringify(req.body);
      } else if (typeof req.body === 'string') {
        bodyData = req.body;
      }
    }

    const webReq = new Request(fullUrl.toString(), {
      method: req.method,
      headers,
      body: bodyData,
    });

    const webRes = await handleChatPost(webReq);

    res.status(webRes.status);
    webRes.headers.forEach((val: string, key: string) => {
      res.setHeader(key, val);
    });

    if (webRes.body) {
      const reader = webRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (err: any) {
    console.error('Vercel API error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }
}
