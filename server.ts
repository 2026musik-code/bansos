import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const API_KEY = "cutad_98e7ba3c88fdfe5526740ed69f59fc71267f4a69";
const BASE_URL = "https://www.cutad.web.id/api/public";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Routes
  app.get("/api/providers", async (req, res) => {
    try {
      const response = await fetch(`${BASE_URL}?key=${API_KEY}`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch providers" });
    }
  });

  app.get("/api/search/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      const { q } = req.query;
      const url = `${BASE_URL}/${provider}?action=search&q=${encodeURIComponent(
        q as string
      )}&key=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to search" });
    }
  });

  app.get("/api/rank/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      const url = `${BASE_URL}/${provider}?action=rank&key=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch rank" });
    }
  });

  app.get("/api/episodes/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      const { id } = req.query;
      const url = `${BASE_URL}/${provider}?action=episodes&id=${encodeURIComponent(id as string)}&key=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch episodes" });
    }
  });

  app.get("/api/stream/:provider", async (req, res) => {
    try {
      const { provider } = req.params;
      const { id } = req.query;
      const url = `${BASE_URL}/${provider}?action=stream&id=${encodeURIComponent(id as string)}&key=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch stream" });
    }
  });

  // CORS Proxy for HLS streams (m3u8 playlists and ts chunks)
  app.get("/api/cors-proxy", async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) return res.status(400).send("URL is required");

      const response = await fetch(targetUrl);
      
      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      res.setHeader("Access-Control-Allow-Origin", "*");

      if (targetUrl.includes(".m3u8")) {
        const text = await response.text();
        const baseUrl = new URL(".", targetUrl).href;
        
        // Rewrite all chunk URLs to go through the proxy
        const lines = text.split('\n').map(line => {
          if (line.trim() && !line.startsWith("#")) {
            // It's a segment URL
            const segmentUrl = line.startsWith("http") ? line : new URL(line.trim(), baseUrl).href;
            return `/api/cors-proxy?url=${encodeURIComponent(segmentUrl)}`;
          }
          // Also rewrite URI attributes in tags
          if (line.includes('URI="')) {
            return line.replace(/URI="([^"]+)"/g, (match, p1) => {
              if (p1.startsWith("data:")) return match;
              const uri = p1.startsWith("http") ? p1 : new URL(p1, baseUrl).href;
              return `URI="/api/cors-proxy?url=${encodeURIComponent(uri)}"`;
            });
          }
          return line;
        });
        
        res.send(lines.join('\n'));
      } else {
        // Stream other files like .ts directly
        if (!response.body) return res.status(500).send("No body");
        const arrayBuffer = await response.arrayBuffer();
        res.send(Buffer.from(arrayBuffer));
      }
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).json({ error: "Failed to proxy request" });
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
