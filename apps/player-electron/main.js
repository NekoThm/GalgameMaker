import { app, BrowserWindow, dialog } from "electron";
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverInstance = null;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}

function safeResolve(rootDir, requestPath) {
  const cleaned = requestPath.split("?")[0].split("#")[0];
  const normalized = path.posix.normalize(cleaned).replace(/^(\.\.(\/|\\|$))+/, "");
  const resolved = path.join(rootDir, normalized);
  if (!resolved.startsWith(rootDir)) return null;
  return resolved;
}

function isValidDir(dirPath) {
  return Boolean(dirPath && existsSync(dirPath) && statSync(dirPath).isDirectory());
}

function resolveContentDir(args) {
  const arg = args.content || args.dir || args._[0];
  if (arg) return path.resolve(arg);
  if (process.env.GALGAME_CONTENT_DIR) return path.resolve(process.env.GALGAME_CONTENT_DIR);
  if (app.isPackaged) {
    const packaged = path.join(process.resourcesPath, "web");
    if (isValidDir(packaged)) return packaged;
  }
  const dev = path.resolve(__dirname, "..", "..", "dist", "web");
  if (isValidDir(dev)) return dev;
  return null;
}

async function chooseContentDir() {
  const result = await dialog.showOpenDialog({
    title: "选择导出目录",
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
}

function createServer(rootDir, port = 0) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const urlPath = req.url ?? "/";
        const filePath = safeResolve(rootDir, urlPath === "/" ? "/index.html" : urlPath);
        if (!filePath) {
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
      } catch (error) {
        res.statusCode = 500;
        res.end("Internal server error");
        console.error(error);
      }
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({ server, port: actualPort });
    });
  });
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: "#000000",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  const args = parseArgs(process.argv);
  let rootDir = resolveContentDir(args);
  if (!isValidDir(rootDir)) {
    rootDir = await chooseContentDir();
  }
  if (!isValidDir(rootDir)) {
    app.quit();
    return;
  }
  const portArg = Number(args.port ?? 0);
  const { server, port } = await createServer(rootDir, Number.isFinite(portArg) ? portArg : 0);
  serverInstance = server;
  createWindow(`http://127.0.0.1:${port}/`);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(`http://127.0.0.1:${port}/`);
  });
});

app.on("before-quit", () => {
  if (serverInstance) serverInstance.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
