const { contextBridge, ipcRenderer } = require("electron");
const path = require("node:path");
const http = require("node:http");
const { readFile, writeFile, stat, mkdir } = require("node:fs/promises");
const { existsSync, createReadStream, statSync } = require("node:fs");

const servers = new Map();

let exportWebFn = null;
let compileProjectFn = null;

async function getExportWeb() {
  if (!exportWebFn) {
    const mod = await import("../../packages/export-web/exporter.js");
    exportWebFn = mod.exportWeb;
  }
  return exportWebFn;
}

async function getCompileProjectFromDir() {
  if (!compileProjectFn) {
    const mod = await import("../../packages/core/src/project-compiler.js");
    compileProjectFn = mod.compileProjectFromDir;
  }
  return compileProjectFn;
}

function normalizeRequestPath(urlPath) {
  const cleaned = urlPath.split("?")[0].split("#")[0];
  return path.posix.normalize(cleaned).replace(/^(\.\.(\/|\\|$))+/, "");
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

async function startPreviewServer(rootDir) {
  const abs = path.resolve(rootDir);
  const existing = servers.get(abs);
  if (existing) return existing.url;
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new Error(`Preview root not found: ${abs}`);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = req.url ?? "/";
      const normalized = normalizeRequestPath(urlPath === "/" ? "/index.html" : urlPath);
      const filePath = path.join(abs, normalized);
      if (!filePath.startsWith(abs)) {
        res.statusCode = 400;
        res.end("Bad request");
        return;
      }

      let finalPath = filePath;
      if (!existsSync(finalPath) || statSync(finalPath).isDirectory()) {
        finalPath = path.join(finalPath, "index.html");
      }

      if (!existsSync(finalPath) || statSync(finalPath).isDirectory()) {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      res.setHeader("Content-Type", contentTypeFor(finalPath));
      res.setHeader("Cache-Control", "no-store");
      if (finalPath.endsWith(".html")) {
        const html = await readFile(finalPath, "utf-8");
        res.end(html);
        return;
      }
      createReadStream(finalPath).pipe(res);
    } catch {
      res.statusCode = 500;
      res.end("Internal error");
    }
  });

  const url = await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to start preview server"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
    server.on("error", reject);
  });

  servers.set(abs, { server, url });
  return url;
}

async function readJson(filePath) {
  const text = await readFile(filePath, "utf-8");
  return JSON.parse(text);
}

async function writeJson(filePath, data) {
  const text = JSON.stringify(data, null, 2) + "\n";
  await writeFile(filePath, text, "utf-8");
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

contextBridge.exposeInMainWorld("editorApi", {
  selectProjectDir: () => ipcRenderer.invoke("select-project"),
  selectOutputDir: (defaultPath) => ipcRenderer.invoke("select-output", defaultPath),
  pathJoin: (...parts) => path.join(...parts),
  pathBasename: (p) => path.basename(p),
  readJson,
  writeJson,
  ensureDir,
  readText: (filePath) => readFile(filePath, "utf-8"),
  stat: (filePath) => stat(filePath),
  compileProject: async (projectDir) => {
    try {
      const compileProjectFromDir = await getCompileProjectFromDir();
      const result = await compileProjectFromDir(projectDir);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, message: e?.message ?? "Compile failed", diagnostics: e?.diagnostics ?? null };
    }
  },
  exportWeb: async (projectDir, outDir) => {
    const exportWeb = await getExportWeb();
    return await exportWeb({ projectDir, outDir });
  },
  startPreview: async (outDir) => {
    return await startPreviewServer(outDir);
  }
});
