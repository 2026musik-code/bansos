import { Hono } from 'hono';

const API_KEY = "cutad_98e7ba3c88fdfe5526740ed69f59fc71267f4a69";
const BASE_URL = "https://www.cutad.web.id/api/public";

const api = new Hono();

api.get("/providers", async (c) => {
  try {
    const response = await fetch(`${BASE_URL}?key=${API_KEY}`);
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Failed to fetch providers" }, 500);
  }
});

api.get("/search/:provider", async (c) => {
  try {
    const provider = c.req.param("provider");
    const q = c.req.query("q") || "";
    const url = `${BASE_URL}/${provider}?action=search&q=${encodeURIComponent(q)}&key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Failed to search" }, 500);
  }
});

api.get("/rank/:provider", async (c) => {
  try {
    const provider = c.req.param("provider");
    const url = `${BASE_URL}/${provider}?action=rank&key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Failed to fetch rank" }, 500);
  }
});

api.get("/episodes/:provider", async (c) => {
  try {
    const provider = c.req.param("provider");
    const id = c.req.query("id") || "";
    const url = `${BASE_URL}/${provider}?action=episodes&id=${encodeURIComponent(id)}&key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Failed to fetch episodes" }, 500);
  }
});

api.get("/stream/:provider", async (c) => {
  try {
    const provider = c.req.param("provider");
    const id = c.req.query("id") || "";
    const url = `${BASE_URL}/${provider}?action=stream&id=${encodeURIComponent(id)}&key=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Failed to fetch stream" }, 500);
  }
});

export default api;
