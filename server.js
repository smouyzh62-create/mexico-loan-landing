const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT || 5173);
const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const DEFAULT_CONFIG = {
  whatsappNumber: "5215500000000",
  facebookPixelId: "",
  whatsappMessage: "Hola, me interesa solicitar un préstamo regular sin anticipos. Mi número es {phone}."
};

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/config" && request.method === "GET") {
      return sendJson(response, 200, await readConfig());
    }

    if (url.pathname === "/api/config" && request.method === "POST") {
      const payload = await readJsonBody(request);

      if (String(payload.adminPassword || "") !== ADMIN_PASSWORD) {
        return sendJson(response, 401, { error: "Unauthorized" });
      }

      const nextConfig = sanitizeConfig(payload);
      await fs.writeFile(CONFIG_PATH, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
      return sendJson(response, 200, nextConfig);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { error: "Method not allowed" });
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Local server running at http://localhost:${PORT}`);
  console.log(`Admin panel available at http://localhost:${PORT}/admin`);
});

async function readConfig() {
  try {
    const file = await fs.readFile(CONFIG_PATH, "utf8");
    return sanitizeConfig(JSON.parse(file));
  } catch {
    await fs.writeFile(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
    return DEFAULT_CONFIG;
  }
}

function sanitizeConfig(config) {
  return {
    whatsappNumber: String(config.whatsappNumber || DEFAULT_CONFIG.whatsappNumber).replace(/\D/g, "").slice(0, 20),
    facebookPixelId: String(config.facebookPixelId || "").replace(/\D/g, "").slice(0, 30),
    whatsappMessage: String(config.whatsappMessage || DEFAULT_CONFIG.whatsappMessage).trim().slice(0, 500)
  };
}

async function readJsonBody(request) {
  let body = "";

  for await (const chunk of request) {
    body += chunk;

    if (body.length > 10_000) {
      throw new Error("Payload too large");
    }
  }

  return JSON.parse(body || "{}");
}

async function serveStatic(urlPath, response) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath === "/admin" ? "/admin.html" : urlPath;
  const filePath = path.normalize(path.join(ROOT_DIR, safePath));

  if (!filePath.startsWith(`${ROOT_DIR}${path.sep}`) && filePath !== ROOT_DIR) {
    return sendText(response, 403, "Forbidden");
  }

  if (path.basename(filePath) === "config.json") {
    return sendText(response, 403, "Forbidden");
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  } catch {
    sendText(response, 404, "Not found");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(text);
}
