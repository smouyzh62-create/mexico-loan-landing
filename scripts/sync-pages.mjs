#!/usr/bin/env node

import { watch } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT_DIR = process.cwd();
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const INDEX_SOURCE = path.join(ROOT_DIR, "index.html");
const ADMIN_SOURCE = path.join(ROOT_DIR, "admin.html");
const CONFIG_SOURCE = path.join(ROOT_DIR, "config.json");
const CNAME_SOURCE = path.join(ROOT_DIR, "CNAME");
const INDEX_TARGET = path.join(DOCS_DIR, "index.html");
const ADMIN_TARGET = path.join(DOCS_DIR, "admin.html");
const CONFIG_TARGET = path.join(DOCS_DIR, "config.js");
const CNAME_TARGET = path.join(DOCS_DIR, "CNAME");
const CUSTOM_DOMAIN = "ustrade.cc";
const IGNORED_PREFIXES = ["docs/", ".git/", "node_modules/"];
const WATCH_EXTENSIONS = new Set([".html", ".json", ".js"]);

let isSyncing = false;
let pendingSync = false;
let debounceTimer = null;

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  await syncOnce();

  if (process.argv.includes("--watch")) {
    console.log("Watching for changes. Press Ctrl+C to stop.");
    watchTree();
  }
}

function watchTree() {
  watch(ROOT_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename || shouldIgnore(filename)) {
      return;
    }

    if (!WATCH_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
      return;
    }

    scheduleSync();
  });
}

function shouldIgnore(filename) {
  return IGNORED_PREFIXES.some((prefix) => filename.startsWith(prefix));
}

function scheduleSync() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runSync();
  }, 500);
}

async function runSync() {
  if (isSyncing) {
    pendingSync = true;
    return;
  }

  isSyncing = true;

  try {
    await syncOnce();
  } catch (error) {
    console.error("Sync failed:", error.message);
  } finally {
    isSyncing = false;

    if (pendingSync) {
      pendingSync = false;
      scheduleSync();
    }
  }
}

async function syncOnce() {
  await fs.mkdir(DOCS_DIR, { recursive: true });

  const indexHtml = await fs.readFile(INDEX_SOURCE, "utf8");
  const buildStamp = Date.now().toString(36);
  const versionedIndexHtml = indexHtml.replace(
    '<script src="./config.js"></script>',
    `<script src="./config.js?v=${buildStamp}"></script>`
  );
  await fs.writeFile(INDEX_TARGET, versionedIndexHtml, "utf8");

  const adminHtml = await fs.readFile(ADMIN_SOURCE, "utf8");
  await fs.writeFile(ADMIN_TARGET, adminHtml, "utf8");

  const config = JSON.parse(await fs.readFile(CONFIG_SOURCE, "utf8"));
  const normalizedConfig = {
    whatsappNumber: String(config.whatsappNumber || "5215500000000").replace(/\D/g, ""),
    facebookPixelId: String(config.facebookPixelId || "").replace(/\D/g, ""),
    whatsappMessage: String(config.whatsappMessage || "Hola, me interesa solicitar un préstamo regular sin anticipos. Mi número es {phone}.")
  };

  const configJs = `window.SITE_CONFIG = ${JSON.stringify(normalizedConfig, null, 2)};\n`;
  await fs.writeFile(CONFIG_TARGET, configJs, "utf8");

  const cnameSource = await readOptionalFile(CNAME_SOURCE);
  const cnameContent = (cnameSource || CUSTOM_DOMAIN).trim();
  await fs.writeFile(CNAME_TARGET, `${cnameContent}\n`, "utf8");

  if (!hasRepoChanges()) {
    console.log("No changes to sync.");
    return;
  }

  execFileSync("git", ["add", "-A"], { stdio: "inherit", cwd: ROOT_DIR });

  try {
    execFileSync("git", ["commit", "-m", "Sync local changes to GitHub"], {
      stdio: "inherit",
      cwd: ROOT_DIR
    });
  } catch (error) {
    if (!String(error?.status || "").length) {
      throw error;
    }
    console.log("Nothing new to commit.");
    return;
  }

  execFileSync("git", ["push"], { stdio: "inherit", cwd: ROOT_DIR });
  console.log("Synced to GitHub.");
}

function hasRepoChanges() {
  try {
    execFileSync("git", ["diff", "--quiet"], { stdio: "ignore", cwd: ROOT_DIR });
    execFileSync("git", ["diff", "--cached", "--quiet"], { stdio: "ignore", cwd: ROOT_DIR });
    return false;
  } catch {
    return true;
  }
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}
