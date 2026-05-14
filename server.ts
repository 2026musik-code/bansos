import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import honoApp from "./src/hono-app.ts"; 

// --- SIMULASI CLOUDFLARE KV & R2 UNTUK AI STUDIO ---
// Di Cloudflare Workers, ini disediakan lewat environment bindings
const patunganKV = {
  get: async (key: string) => {
    const dbPath = path.join(process.cwd(), 'kv-patungan.json');
    if (!fs.existsSync(dbPath)) return null;
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    return db[key] || null;
  },
  put: async (key: string, value: string) => {
    const dbPath = path.join(process.cwd(), 'kv-patungan.json');
    let db: any = {};
    if (fs.existsSync(dbPath)) db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    db[key] = value;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  },
  delete: async (key: string) => {
    const dbPath = path.join(process.cwd(), 'kv-patungan.json');
    if (!fs.existsSync(dbPath)) return;
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    delete db[key];
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }
};

const vpsaiR2 = {
  get: async (key: string) => {
    const dbPath = path.join(process.cwd(), 'r2-vpsai.json');
    if (!fs.existsSync(dbPath)) return null;
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    if (!db[key]) return null;
    return {
      text: async () => db[key],
      json: async () => JSON.parse(db[key])
    };
  },
  put: async (key: string, value: string) => {
    const dbPath = path.join(process.cwd(), 'r2-vpsai.json');
    let db: any = {};
    if (fs.existsSync(dbPath)) db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    db[key] = value;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  },
  delete: async (key: string) => {
    const dbPath = path.join(process.cwd(), 'r2-vpsai.json');
    if (!fs.existsSync(dbPath)) return;
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    delete db[key];
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  }
};

const env = { patungan: patunganKV, vpsai: vpsaiR2 };

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // ALL /api requests dirutekan ke Hono App
  app.all('/api/*', async (req, res) => {
    try {
       const url = `http://${req.headers.host}${req.url}`;
       console.log(`[Express] Routing ${req.method} ${req.url} -> Hono`);
       const init: RequestInit = {
         method: req.method,
         headers: req.headers as HeadersInit,
       };
       
       if (req.method !== 'GET' && req.method !== 'HEAD') {
         if (req.body && Object.keys(req.body).length > 0) {
           init.body = JSON.stringify(req.body);
         }
       }
       
       const webReq = new Request(url, init);
       
       // Panggil Hono Worker dengan mock env
       const response = await honoApp.fetch(webReq, env);
       
       // Explicitly prevent HTML responses
       const contentType = response.headers.get('content-type') || 'application/json';
       if (contentType.includes('text/html')) {
          console.warn(`[Express] Intercepted HTML response from Hono for ${req.url}. Overriding to JSON.`);
          res.setHeader('Content-Type', 'application/json');
          res.status(500).json({ error: "Upstream returned HTML", data: [] });
          return;
       }
       
       // Pass Headers & Status via Express
       response.headers.forEach((value, key) => res.setHeader(key, value));
       res.status(response.status);
       
       const arrayBuffer = await response.arrayBuffer();
       res.send(Buffer.from(arrayBuffer));
       
    } catch (e) {
       console.error('[Express] Hono Adapter Error:', e);
       res.setHeader('Content-Type', 'application/json');
       res.status(500).json({ error: "Hono Adapter Error", details: String(e) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
