import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  if (!resolved.startsWith(rootDir)) {
    return null;
  }
  return resolved;
}

const args = parseArgs(process.argv);
const rootArg = args._[0] ?? "dist/web";
const rootDir = path.resolve(__dirname, "..", rootArg);
const port = Number(args.port ?? 5173);

if (!existsSync(rootDir) || !statSync(rootDir).isDirectory()) {
  console.error(`[serve] root not found or not a directory: ${rootDir}`);
  process.exit(1);
}

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

server.listen(port, "127.0.0.1", () => {
  console.log(`[serve] http://127.0.0.1:${port} -> ${rootDir}`);
});

