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

// Rate limiting untuk Admin Login
const adminLocks = new Map<string, { attempts: number, lockUntil: number }>();

app.post('/api/admin/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const realIp = ip.split(',')[0].trim();
  
  const lock = adminLocks.get(realIp);
  if (lock && lock.lockUntil > Date.now()) {
    return c.json({ error: "Too many failed attempts. Try again later." }, 429);
  }

  const { password } = await c.req.json();
  const config = await getConfig(c.env);
  
  if (password === config.adminPassword) {
    if (lock) adminLocks.delete(realIp);
    return c.json({ success: true });
  }
  
  const attempts = (lock?.attempts || 0) + 1;
  adminLocks.set(realIp, {
    attempts,
    lockUntil: attempts >= 5 ? Date.now() + 60 * 60 * 1000 : 0 // Blokir 1 jam setelah 5x gagal
  });
  
  console.warn(`[SECURITY] Failed admin login from ${realIp}. Attempts: ${attempts}`);
  return c.json({ error: "Unauthorized" }, 401);
});

// Middleware Admin
const adminRateLocks = new Map<string, { attempts: number, lockUntil: number }>();

const adminAuth = async (c: any, next: any) => {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const realIp = ip.split(',')[0].trim();

  // Memeriksa rate limit
  const lock = adminRateLocks.get(realIp);
  if (lock && lock.lockUntil > Date.now()) {
    return c.json({ error: "Too many requests. Try again later." }, 429);
  }

  const password = c.req.header('x-admin-password');
  const config = await getConfig(c.env);
  
  if (password === config.adminPassword) {
    // Reset rate limit jika berhasil
    if (lock) adminRateLocks.delete(realIp);
    await next();
  } else {
    // Menambah hitungan kegagalan
    const attempts = (lock?.attempts || 0) + 1;
    adminRateLocks.set(realIp, {
      attempts,
      lockUntil: attempts >= 10 ? Date.now() + 60 * 60 * 1000 : 0 // Blokir 1 jam setelah 10x gagal akses endpoint admin dengan password salah
    });
    console.warn(`[SECURITY] Failed admin endpoint access from ${realIp}. Attempts: ${attempts}`);
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

const fetchCutadAPI = async (url: string, c: any, shouldRewriteStream = false) => {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.cutad.web.id/'
      }
    });

    if (!response.ok) {
      console.error(`Upstream API failed with status ${response.status} for ${url}`);
      return c.json({ error: `Server Error, please try again later.`, data: [] }, response.status);
    }
    
    let text = await response.text();

    if (shouldRewriteStream) {
      try {
        const json = JSON.parse(text);
        
        const rewriteObj = async (obj: any) => {
          if (!obj) return;
          for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'string' && obj[key].includes('.m3u8')) {
               const exp = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
               const token = await generateToken(obj[key], exp);
               obj[key] = `/api/cors-proxy?url=${encodeURIComponent(obj[key])}&exp=${exp}&token=${token}`;
            } else if (typeof obj[key] === 'object') {
               await rewriteObj(obj[key]);
            }
          }
        };
        await rewriteObj(json);
        return c.json(json);
      } catch (e) {
        // ... handled below
      }
    }

    try {
      return c.json(JSON.parse(text));
    } catch (e) {
      console.error(`Failed to parse JSON for ${url}. Raw text snippet: ${text.slice(0, 200)}`);
      return c.json({ error: "Internal Server Error", data: [] }, 500);
    }
  } catch (error: any) {
    console.error(`Fetch error to Upstream:`, error);
    return c.json({ error: "Network Error", data: [] }, 500);
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
  const deviceId = c.req.query('deviceId'); // Client must pass this!
  
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1';
  const realIp = ip.split(',')[0].trim();
  
  const config = await getConfig(c.env);
  let user = config.users.find((u: any) => 
    (deviceId && u.deviceId === deviceId) || 
    (u.ip === realIp)
  );
  
  if (!user || user.dataLimit >= user.limit) {
      return c.json({ error: "Limit Exceeded", exceeded: true }, 403);
  }

  const apiKey = await getApiKey(c.env);
  const url = `${BASE_CUTAD}/${provider}?action=stream&id=${encodeURIComponent(id)}&key=${apiKey}`;
  const response = await fetchCutadAPI(url, c, true);
  
  // Note: we can inject a temporary streaming token here if needed
  return response;
});

// Simple HMAC-like hashing using Web Crypto API or a fallback if running locally
const generateToken = async (url: string, exp: number) => {
    const textToHash = url + exp + "SUPER_SECRET_TOKEN_XDRAMA_2026";
    const msgUint8 = new TextEncoder().encode(textToHash);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

app.post('/api/proxy-token', async (c) => {
   const { url } = await c.req.json();
   if (!url) return c.json({ error: "Missing url" }, 400);
   const exp = Date.now() + 1000 * 60 * 60; // 1 jam masa aktif
   const token = await generateToken(url, exp);
   return c.json({ token, exp });
});

// CORS Proxy untuk Stream (m3u8, ts)
app.get('/api/cors-proxy', async (c) => {
  const targetUrl = c.req.query('url');
  const exp = parseInt(c.req.query('exp') || '0', 10);
  const token = c.req.query('token') || c.req.query('t'); // 't' from internal m3u8 rewrite
  
  if (!targetUrl) return c.text("URL is required", 400);

  // Mencegah proxy digunakan oleh web/aplikasi lain
  const referer = c.req.header('Referer') || '';
  const origin = c.req.header('Origin') || '';
  const host = c.req.header('Host') || '';
  
  const isAllowedOrigin = origin.includes(host) || referer.includes(host) || origin.includes('id.xdrama.web.id') || referer.includes('id.xdrama.web.id');
  const ua = c.req.header('user-agent') || '';
  const isDirectCurl = !ua.includes('Mozilla') && !ua.includes('AppleWebKit');
  
  // Validasi JWT / Token Expiry
  if (token && exp && Date.now() > exp) {
     return c.text("Token expired", 403);
  }

  // Jika dipanggil dari playlist internal (parameter 't'), kita bypass validasi referer strict,
  // TAPI token 't' harus sesuai (generated below)
  let isInternalSegment = false;
  if (c.req.query('t')) {
       // Verifikasi simple custom token untuk segment internal playlist
       const expectedT = await generateToken(targetUrl, 0); 
       if (token === expectedT) isInternalSegment = true;
  } else {
       // External request (initial m3u8), we strictly validate signature
       if (exp) {
          const expected = await generateToken(targetUrl, exp);
          if (token !== expected) {
              return c.text("Invalid Token Signature", 403);
          }
       } else {
           // Fallback to strict origin if no signature, though signature preferred
           if (!isAllowedOrigin && !isDirectCurl && (origin || referer)) {
               return c.text("Access Denied: Unrecognized Origin", 403);
           }
           if (!targetUrl.includes('.m3u8') && !targetUrl.includes('.ts') && !targetUrl.includes('.mp4')) {
               return c.text("Token required for arbitrary proxy endpoints", 403);
           }
       }
  }

  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': targetUrl.startsWith('http') ? new URL(targetUrl).origin : 'https://www.cutad.web.id/'
    }
  });
  
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Access-Control-Allow-Origin", "*");

  if (targetUrl.includes(".m3u8")) {
    const text = await response.text();
    const baseUrl = new URL(".", targetUrl).href;

    const lines = await Promise.all(text.split('\n').map(async line => {
      if (line.trim() && !line.startsWith("#")) {
        const segmentUrl = line.startsWith("http") ? line : new URL(line.trim(), baseUrl).href;
        const subToken = await generateToken(segmentUrl, 0);
        return `/api/cors-proxy?url=${encodeURIComponent(segmentUrl)}&t=${subToken}`;
      }
      if (line.includes('URI="')) {
        // Handle sync/async logic carefully here, replacing is sync but generator is async.
        // It's easier manually parsing:
        const match = line.match(/URI="([^"]+)"/);
        if (match && !match[1].startsWith("data:")) {
           const uri = match[1].startsWith("http") ? match[1] : new URL(match[1], baseUrl).href;
           const subToken = await generateToken(uri, 0);
           return line.replace(/URI="[^"]+"/, `URI="/api/cors-proxy?url=${encodeURIComponent(uri)}&t=${subToken}"`);
        }
      }
      return line;
    }));
    
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
