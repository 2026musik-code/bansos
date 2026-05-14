import { Hono } from 'hono';
import { cors } from 'hono/cors';

export type Bindings = {
  patungan: any; // Cloudflare KV 
  vpsai: any;       // Cloudflare R2
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for all API routes
app.use('/api/*', cors());

// --- HELPER UNTUK KV & R2 ---

// KV: Ambil konfigurasi (Users, Admin Password, Popup)
const getConfig = async (env: Bindings) => {
  const data = await env.patungan.get('config');
  if (data) return JSON.parse(data);
  return { popupText: "", qrImage: "", adminPassword: "admin", users: [] };
};

// KV: Simpan konfigurasi
const saveConfig = async (env: Bindings, config: any) => {
  await env.patungan.put('config', JSON.stringify(config));
};

// R2: Ambil API Key
const getApiKey = async (env: Bindings) => {
  const obj = await env.vpsai.get('api_key.txt');
  if (obj) {
    return await obj.text();
  }
  return 'cutad_98e7ba3c88fdfe5526740ed69f59fc71267f4a69'; // Default fallback
};

// R2: Simpan API Key
const saveApiKey = async (env: Bindings, key: string) => {
  await env.vpsai.put('api_key.txt', key);
};

// --- AUTH & ADMIN ENDPOINTS ---

app.post('/api/admin/login', async (c) => {
  const { password } = await c.req.json();
  const config = await getConfig(c.env);
  if (password === config.adminPassword) {
    return c.json({ success: true });
  }
  return c.json({ error: "Unauthorized" }, 401);
});

// Middleware Admin
const adminAuth = async (c: any, next: any) => {
  const password = c.req.header('x-admin-password');
  const config = await getConfig(c.env);
  if (password === config.adminPassword) {
    await next();
  } else {
    return c.json({ error: "Unauthorized" }, 401);
  }
};

app.get('/api/admin/config', adminAuth, async (c) => {
  const config = await getConfig(c.env);
  const apiKey = await getApiKey(c.env);
  return c.json({
    popupText: config.popupText,
    qrImage: config.qrImage,
    users: config.users,
    apiKey
  });
});

app.post('/api/admin/config', adminAuth, async (c) => {
  const body = await c.req.json();
  const config = await getConfig(c.env);
  
  if (body.popupText !== undefined) config.popupText = body.popupText;
  if (body.qrImage !== undefined) config.qrImage = body.qrImage;
  
  await saveConfig(c.env, config);
  
  if (body.apiKey !== undefined && body.apiKey.trim() !== '') {
    await saveApiKey(c.env, body.apiKey);
  }
  
  return c.json({ success: true });
});

app.post('/api/admin/password', adminAuth, async (c) => {
  const body = await c.req.json();
  if (body.newPassword) {
    const config = await getConfig(c.env);
    config.adminPassword = body.newPassword;
    await saveConfig(c.env, config);
    return c.json({ success: true });
  }
  return c.json({ error: "newPassword is required" }, 400);
});

app.delete('/api/admin/users/:id', adminAuth, async (c) => {
  const id = c.req.param('id');
  const config = await getConfig(c.env);
  config.users = config.users.filter((u: any) => u.id !== id);
  await saveConfig(c.env, config);
  return c.json({ success: true });
});

app.post('/api/admin/users/:id', adminAuth, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const config = await getConfig(c.env);
  const user = config.users.find((u: any) => u.id === id);
  if (user) {
    if (body.limit !== undefined) user.limit = body.limit;
    await saveConfig(c.env, config);
    return c.json({ success: true, user });
  }
  return c.json({ error: "User not found" }, 404);
});

app.post('/api/track', async (c) => {
  const body = await c.req.json();
  const ip = c.req.header('x-forwarded-for') || '127.0.0.1';
  const userAgent = c.req.header('user-agent') || 'unknown';
  
  const config = await getConfig(c.env);
  let user = config.users.find((u: any) => u.ip === ip && u.userAgent === userAgent);
  
  if (!user) {
    user = {
      id: Date.now().toString(),
      ip,
      userAgent,
      limit: 10, // Default limit gratis
      dataLimit: 0,
      lastActive: new Date().toISOString()
    };
    config.users.push(user);
  } else {
    user.lastActive = new Date().toISOString();
    // Hitungan play (streaming mulai)
    if (body.action === 'play') {
      user.dataLimit += 1;
    }
  }
  await saveConfig(c.env, config);
  
  return c.json({
    exceeded: user.dataLimit >= user.limit,
    popupText: config.popupText,
    qrImage: config.qrImage,
    user
  });
});

// --- CUTAD API PROXIES ---
const BASE_CUTAD = "https://www.cutad.web.id/api/public";

app.get('/api/providers', async (c) => {
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}?action=providers&key=${apiKey}`;
  const response = await fetch(url);
  return c.json(await response.json());
});

app.get('/api/search/:provider', async (c) => {
  const provider = c.req.param('provider');
  const q = c.req.query('q') || '';
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}/${provider}?action=search&q=${encodeURIComponent(q)}&key=${apiKey}`;
  const response = await fetch(url);
  return c.json(await response.json());
});

app.get('/api/rank/:provider', async (c) => {
  const provider = c.req.param('provider');
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}/${provider}?action=rank&key=${apiKey}`;
  const response = await fetch(url);
  return c.json(await response.json());
});

app.get('/api/episodes/:provider', async (c) => {
  const provider = c.req.param('provider');
  const id = c.req.query('id') || '';
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}/${provider}?action=episodes&id=${encodeURIComponent(id)}&key=${apiKey}`;
  const response = await fetch(url);
  return c.json(await response.json());
});

app.get('/api/stream/:provider', async (c) => {
  const provider = c.req.param('provider');
  const id = c.req.query('id') || '';
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}/${provider}?action=stream&id=${encodeURIComponent(id)}&key=${apiKey}`;
  const response = await fetch(url);
  return c.json(await response.json());
});

// CORS Proxy untuk Stream (m3u8, ts)
app.get('/api/cors-proxy', async (c) => {
  const targetUrl = c.req.query('url');
  if (!targetUrl) return c.text("URL is required", 400);

  const response = await fetch(targetUrl);
  
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Access-Control-Allow-Origin", "*");

  if (targetUrl.includes(".m3u8")) {
    const text = await response.text();
    const baseUrl = new URL(".", targetUrl).href;
    
    const lines = text.split('\n').map(line => {
      if (line.trim() && !line.startsWith("#")) {
        const segmentUrl = line.startsWith("http") ? line : new URL(line.trim(), baseUrl).href;
        return `/api/cors-proxy?url=${encodeURIComponent(segmentUrl)}`;
      }
      if (line.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (match, p1) => {
          if (p1.startsWith("data:")) return match;
          const uri = p1.startsWith("http") ? p1 : new URL(p1, baseUrl).href;
          return `URI="/api/cors-proxy?url=${encodeURIComponent(uri)}"`;
        });
      }
      return line;
    });
    
    return new Response(lines.join('\n'), { headers, status: response.status });
  }

  return new Response(response.body, { headers, status: response.status });
});

export default app;
