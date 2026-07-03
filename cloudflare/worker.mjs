const DEFAULT_CONFIG = {
  telegramIds: [],
  facebookPixelId: "",
  telegramMessage: "Hola, me interesa solicitar un préstamo regular sin anticipos. Mi número es {phone}.",
  apiBaseUrl: "https://api-ustrade.smouyzh62.workers.dev"
};

const CONFIG_KEY = "site-config";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }), request);
    }

    if (url.pathname === "/healthz") {
      return withCors(jsonResponse({
        ok: true,
        service: "cloudflare-worker",
        updatedAt: new Date().toISOString()
      }), request);
    }

    if (url.pathname === "/config.js" && (request.method === "GET" || request.method === "HEAD")) {
      const config = await readConfig(env);
      return withCors(textResponse(`window.SITE_CONFIG = ${JSON.stringify(config, null, 2)};\n`, "application/javascript; charset=utf-8"), request);
    }

    if (url.pathname === "/api/config" && request.method === "GET") {
      return withCors(jsonResponse(await readConfig(env)), request);
    }

    if (url.pathname === "/api/config" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      if (String(payload.adminPassword || "") !== String(env.ADMIN_PASSWORD || "")) {
        return withCors(jsonResponse({ error: "Unauthorized" }, 401), request);
      }

      const nextConfig = sanitizeConfig(payload);
      await env.SITE_CONFIG_KV.put(CONFIG_KEY, JSON.stringify({
        ...nextConfig,
        updatedAt: new Date().toISOString()
      }));

      return withCors(jsonResponse(nextConfig), request);
    }

    if (url.pathname === "/api/deploy-status" && request.method === "GET") {
      const config = await readConfig(env);
      const stored = await readStoredMetadata(env);

      return withCors(jsonResponse({
        localHead: "cloudflare-worker",
        localCommitMessage: "Cloudflare Worker backend",
        branchStatus: "KV-backed configuration",
        workflowRun: {
          id: 1,
          status: "completed",
          conclusion: "success",
          htmlUrl: "https://dash.cloudflare.com/",
          headSha: "",
          displayTitle: "Cloudflare Worker",
          updatedAt: stored.updatedAt || new Date().toISOString()
        },
        pagesUrl: config.apiBaseUrl || "https://smouyzh62-create.github.io/mexico-loan-landing/"
      }), request);
    }

    return withCors(jsonResponse({ error: "Not found" }, 404), request);
  }
};

async function readConfig(env) {
  const stored = await readStoredConfig(env);
  return sanitizeConfig(stored);
}

async function readStoredConfig(env) {
  const raw = await env.SITE_CONFIG_KV.get(CONFIG_KEY, "text");
  if (!raw) {
    return DEFAULT_CONFIG;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return DEFAULT_CONFIG;
  }
}

async function readStoredMetadata(env) {
  const raw = await env.SITE_CONFIG_KV.get(CONFIG_KEY, "text");
  if (!raw) {
    return { updatedAt: null };
  }

  try {
    const parsed = JSON.parse(raw);
    return { updatedAt: parsed.updatedAt || null };
  } catch {
    return { updatedAt: null };
  }
}

function sanitizeConfig(config) {
  const telegramIdsSource = Array.isArray(config.telegramIds) && config.telegramIds.length
    ? config.telegramIds
    : String(
        typeof config.telegramIds === "string" && config.telegramIds.trim()
          ? config.telegramIds
          : ""
      ).split(/[\n,]+/);

  return {
    telegramIds: telegramIdsSource.map((value) => normalizeTelegramId(value)).filter(Boolean),
    facebookPixelId: String(config.facebookPixelId || "").replace(/\D/g, "").slice(0, 30),
    telegramMessage: String(config.telegramMessage || DEFAULT_CONFIG.telegramMessage).trim().slice(0, 500),
    apiBaseUrl: String(config.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl).trim().replace(/\/+$/, "")
  };
}

function normalizeTelegramId(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return "";
  }

  const tmeMatch = value.match(/^(?:https?:\/\/)?t\.me\/(.+)$/i);
  if (tmeMatch) {
    return normalizeTelegramId(tmeMatch[1]);
  }

  if (value.startsWith("@")) {
    return value.slice(1).replace(/[^a-zA-Z0-9_]/g, "");
  }

  if (value.startsWith("+")) {
    const digits = value.replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }

  if (/^\d[\d\s()-]*$/.test(value)) {
    return value.replace(/\D/g, "");
  }

  return value.replace(/[^a-zA-Z0-9_]/g, "");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function textResponse(body, contentType = "text/plain; charset=utf-8") {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    }
  });
}

function withCors(response, request) {
  const origin = request.headers.get("Origin") || "*";
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    headers
  });
}
