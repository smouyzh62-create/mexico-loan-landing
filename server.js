const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { execFileSync } = require("child_process");

const PORT = Number(process.env.PORT || 5173);
const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123456";
const GITHUB_OWNER = process.env.GITHUB_OWNER || "smouyzh62-create";
const GITHUB_REPO = process.env.GITHUB_REPO || "mexico-loan-landing";
const GITHUB_WORKFLOW = process.env.GITHUB_WORKFLOW || "pages.yml";

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

    if (url.pathname === "/api/deploy-status" && request.method === "GET") {
      return sendJson(response, 200, await readDeployStatus());
    }

    if (url.pathname === "/config.js" && (request.method === "GET" || request.method === "HEAD")) {
      return sendText(response, 200, `window.SITE_CONFIG = ${JSON.stringify(await readConfig(), null, 2)};\n`, "application/javascript; charset=utf-8");
    }

    if (url.pathname === "/api/config" && request.method === "POST") {
      const payload = await readJsonBody(request);

      if (String(payload.adminPassword || "") !== ADMIN_PASSWORD) {
        return sendJson(response, 401, { error: "Unauthorized" });
      }

      const nextConfig = sanitizeConfig(payload);
      await fs.writeFile(CONFIG_PATH, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

      try {
        execFileSync("node", [path.join(ROOT_DIR, "scripts", "sync-pages.mjs")], {
          cwd: ROOT_DIR,
          stdio: "inherit"
        });
      } catch (error) {
        console.error("Auto-sync failed:", error.message);
        return sendJson(response, 500, { error: "Saved locally, but auto-sync to GitHub failed" });
      }

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

async function readDeployStatus() {
  const localHead = runGit(["rev-parse", "HEAD"]).trim();
  const localCommitMessage = runGit(["log", "-1", "--pretty=%s"]).trim();
  const branchStatus = runGit(["status", "--short", "--branch"]).trim();
  const workflowRun = await readLatestWorkflowRun();

  return {
    localHead,
    localCommitMessage,
    branchStatus,
    workflowRun,
    pagesUrl: `https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/`
  };
}

async function readLatestWorkflowRun() {
  try {
    const endpoint = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?per_page=1`;
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!response.ok) {
      return { error: `GitHub API ${response.status}` };
    }

    const payload = await response.json();
    const run = payload.workflow_runs?.[0];

    if (!run) {
      return { error: "No workflow runs found" };
    }

    return {
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      htmlUrl: run.html_url,
      headSha: run.head_sha,
      displayTitle: run.display_title,
      updatedAt: run.updated_at
    };
  } catch (error) {
    return { error: error.message };
  }
}

function runGit(args) {
  return execFileSync("git", args, { cwd: ROOT_DIR, encoding: "utf8" });
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

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(text);
}
