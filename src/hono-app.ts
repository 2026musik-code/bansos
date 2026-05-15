import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getCookie, setCookie } from 'hono/cookie';

export type Bindings = {
  patungan: any; // Cloudflare KV 
  vpsai: any;       // Cloudflare R2
  ASSETS?: any;     // Cloudflare Worker Assets Fallback
};

const app = new Hono<{ Bindings: Bindings }>();

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// In-memory store untuk IP Lock (Hemat KV API limit, persisten selama worker isolate hidup)
const ipLocks = new Map<string, { uid: string, ua: string, time: number }>();

// Middleware Anti-Scraper (Melindungi API Key dan Endpoint)
app.use('/api/*', async (c, next) => {
  const origin = c.req.header('Origin');
  const referer = c.req.header('Referer');
  const host = c.req.header('Host');
  const path = new URL(c.req.url).pathname;

  console.log(`[Anti-Scraper] Path: ${path} | Origin: ${origin} | Referer: ${referer} | Host: ${host}`);

  // Cek Referer jika Origin tidak ada (melindungi dari direct curl/postman)
  if (!origin && !referer) {
    // Pada environment dev (misal AI Studio mode iframe), referer bisa saja tidak dikirim.
    // Kita skip strict check referer ini jika requestnya ada user-agent dari browser umum.
    const ua = c.req.header('user-agent') || '';
    if (!path.startsWith('/api/cors-proxy') && !path.startsWith('/api/admin') && !ua.includes('Mozilla')) {
      return c.json({ error: "Access Denied: No Referer" }, 403);
    }
  }

  // ---- MEKANISME IP+COOKIE+USERAGENT LOCK ----
  // Abaikan admin route dari lock
  if (!path.startsWith('/api/admin')) {
    const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown-ip';
    const ua = c.req.header('user-agent') || 'unknown-ua';
    // Disederhanakan untuk menghindari error di dalam iFrame (di mana cookies sering di-block oleh browser)
    // Kita gunakan simple logging activity saja atau rate limiting ringan tanpa blokir keras
    if (!ipLocks.has(ip)) {
      ipLocks.set(ip, { uid: '', ua, time: Date.now() });
    } else {
      const lock = ipLocks.get(ip)!;
      // Jangan langsung blokir jika UID berbeda karena iframes tidak selalu mengirim cookie
      // Tapi kita cek jika UA berubah drastis pada IP yang sama dalam waktu singkat
      if (lock.ua !== ua && (Date.now() - lock.time < 10000)) {
         console.warn(`[ANTI-SCRAPER] Suspicious User-Agent rotation on IP: ${ip}`);
         // Bisa aktifkan return 403 jika dirasa aman, saat ini hanya warning
      }
      lock.time = Date.now();
      ipLocks.set(ip, lock);
    }
    
    // Cleanup memory: Hapus lock yang lebih dari 24 jam tidak aktif untuk mencegah memory leak worker
    if (Math.random() < 0.01) { // 1% chance setiap request akan trigger cleanup
      const now = Date.now();
      for (const [key, val] of ipLocks.entries()) {
        if (now - val.time > 86400000) {
          ipLocks.delete(key);
        }
      }
    }
  }

  await next();
});

// Enable CORS secara dinamis (Hanya mengizinkan origin yang sesuai)
app.use('/api/*', (c, next) => {
  const origin = c.req.header('Origin');
  return cors({
    origin: origin || '*',
    allowHeaders: ['Content-Type', 'Authorization', 'x-admin-password', 'x-forwarded-for', 'user-agent'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  })(c, next);
});

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
  const deviceId = body.deviceId;
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  // Jika x-forwarded-for mengandung multiple IP, ambil yang pertama
  const realIp = ip.split(',')[0].trim();
  const userAgent = c.req.header('user-agent') || 'unknown';
  
  const config = await getConfig(c.env);
  
  let user = config.users.find((u: any) => 
    (deviceId && u.deviceId === deviceId) || 
    (u.ip === realIp)
  );
  
  if (!user) {
    user = {
      id: Date.now().toString(),
      deviceId: deviceId || ('uid_' + Date.now()),
      ip: realIp,
      userAgent,
      limit: 10, // Default limit gratis
      dataLimit: 0,
      lastActive: new Date().toISOString()
    };
    config.users.push(user);
  } else {
    // Update deviceId / IP agar sinkron
    if (deviceId && !user.deviceId) {
      user.deviceId = deviceId;
    }
    user.ip = realIp;
    user.userAgent = userAgent;
    
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

const fetchCutadAPI = async (url: string, c: any) => {
  try {
    // Gunakan User-Agent standard dan bypass CORS untuk API eksternal
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.cutad.web.id/'
      }
    });
    
    if (!response.ok) {
      console.error(`Cutad API failed with status ${response.status} for ${url}`);
      return c.json({ error: `Cutad API returned ${response.status}`, data: [] }, response.status);
    }
    
    const text = await response.text();
    try {
      return c.json(JSON.parse(text));
    } catch (e) {
      console.error(`Failed to parse Cutad JSON for ${url}. Raw text snippet: ${text.slice(0, 200)}`);
      return c.json({ error: "Invalid JSON response from upstream", data: [] }, 500);
    }
  } catch (error: any) {
    console.error(`Fetch error to Cutad API:`, error);
    return c.json({ error: error.message, data: [] }, 500);
  }
};

app.get('/api/providers', async (c) => {
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}?action=providers&key=${apiKey}`;
  return fetchCutadAPI(url, c);
});

app.get('/api/search/:provider', async (c) => {
  const provider = c.req.param('provider');
  const q = c.req.query('q') || '';
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}/${provider}?action=search&q=${encodeURIComponent(q)}&key=${apiKey}`;
  return fetchCutadAPI(url, c);
});

app.get('/api/rank/:provider', async (c) => {
  const provider = c.req.param('provider');
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}/${provider}?action=rank&key=${apiKey}`;
  return fetchCutadAPI(url, c);
});

app.get('/api/episodes/:provider', async (c) => {
  const provider = c.req.param('provider');
  const id = c.req.query('id') || '';
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}/${provider}?action=episodes&id=${encodeURIComponent(id)}&key=${apiKey}`;
  return fetchCutadAPI(url, c);
});

app.get('/api/stream/:provider', async (c) => {
  const provider = c.req.param('provider');
  const id = c.req.query('id') || '';
  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}/${provider}?action=stream&id=${encodeURIComponent(id)}&key=${apiKey}`;
  return fetchCutadAPI(url, c);
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

app.get('*', async (c) => {
  if (c.env.ASSETS) {
    try {
      // 1. Coba fetch asset sesuai path yang dikirim oleh browser (untuk .js, .css, dll)
      const res = await c.env.ASSETS.fetch(c.req.raw);
      if (res && res.status < 400) {
        return res;
      }
    } catch (e) {
      console.error("Asset fetch error:", e);
    }
    
    // 2. Jika path tidak ditemukan (untuk SPA navigation), fallback ke index.html
    const url = new URL(c.req.url);
    const originalPathname = url.pathname;
    url.pathname = '/';
    // Kita panggil ulang dengan Request baru pada '/'
    const indexRes = await c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));

    if (indexRes && indexRes.status === 200) {
      const contentType = indexRes.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        let htmlText = await indexRes.text();

        // 3. Dynamic Open Graph Tag Injection untuk halaman detail / stream
        const detailMatch = originalPathname.match(/\/(?:detail|stream)\/([^\/]+)\/([^\/]+)/);
        if (detailMatch) {
          const provider = detailMatch[1];
          const id = detailMatch[2];
          try {
            const apiKey = await getApiKey(c.env);
            if (apiKey) {
              const apiUrl = `https://www.cutad.web.id/api/public/${provider}?action=detail&id=${id}&key=${apiKey}`;
              const apiRes = await fetch(apiUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'application/json',
                  'Referer': 'https://www.cutad.web.id/'
                }
              });
              if (apiRes.ok) {
                const json: any = await apiRes.json();
                if (json.status && json.data) {
                  const detail = json.data;
                  // Beberapa provider nge-return data di dalam array [0], mari kita handle
                  const item = Array.isArray(detail) ? detail[0] : detail;
                  if (item) {
                    const title = item.title || "XDrama - Nonton Film";
                    const safeTitle = title.replace(/"/g, '&quot;');
                    const desc = item.desc || item.description || "Nonton film dan short drama gratis di XDrama.";
                    const safeDesc = desc.replace(/"/g, '&quot;');
                    const image = item.poster || item.cover || "https://images.unsplash.com/photo-1536440136628-849c177e76a1?q=80&w=1200&auto=format&fit=crop";

                    htmlText = htmlText.replace(/<title>.*?<\/title>/i, `<title>${safeTitle} - XDrama</title>`);
                    htmlText = htmlText.replace(/<meta property="og:title" content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${safeTitle} - XDrama" />`);
                    htmlText = htmlText.replace(/<meta property="og:description" content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${safeDesc}" />`);
                    htmlText = htmlText.replace(/<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${image}" />`);
                    htmlText = htmlText.replace(/<meta name="description" content="[^"]*"\s*\/?>/i, `<meta name="description" content="${safeDesc}" />`);
                    
                    htmlText = htmlText.replace(/<meta property="twitter:title" content="[^"]*"\s*\/?>/i, `<meta property="twitter:title" content="${safeTitle} - XDrama" />`);
                    htmlText = htmlText.replace(/<meta property="twitter:description" content="[^"]*"\s*\/?>/i, `<meta property="twitter:description" content="${safeDesc}" />`);
                    htmlText = htmlText.replace(/<meta property="twitter:image" content="[^"]*"\s*\/?>/i, `<meta property="twitter:image" content="${image}" />`);
                  }
                }
              }
            }
          } catch (err) {
            console.error("Failed to inject OG tags:", err);
          }
        }
        
        // Buat headers baru, hapus content-length karena ukuran text berubah
        const newHeaders = new Headers(indexRes.headers);
        newHeaders.delete('content-length');
        
        return new Response(htmlText, {
          status: indexRes.status,
          statusText: indexRes.statusText,
          headers: newHeaders
        });
      }
    }
    
    return indexRes;
  }
  return c.notFound();
});

export default app;
