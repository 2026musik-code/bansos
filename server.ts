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
