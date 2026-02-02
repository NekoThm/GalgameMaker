import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile, copyFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { compileProjectFromDir } from "../core/src/project-compiler.js";

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

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function copyDir(srcDir, dstDir) {
  await ensureDir(dstDir);
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyDir(src, dst);
      continue;
    }
    if (entry.isFile()) {
      await ensureDir(path.dirname(dst));
      await copyFile(src, dst);
    }
  }
}

async function writeJson(filePath, data) {
  const text = JSON.stringify(data, null, 2) + "\n";
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, text, "utf-8");
}

async function main() {
  const args = parseArgs(process.argv);
  const projectArg = args.project ?? args.p;
  const outArg = args.out ?? args.o;

  if (!projectArg || !outArg) {
    console.error("Usage: node \"packages/export-web/cli.js\" --project \"examples/MyGame\" --out \"dist/web\"");
    process.exit(1);
  }

  const projectDir = path.resolve(process.cwd(), projectArg);
  const outDir = path.resolve(process.cwd(), outArg);

  if (!existsSync(projectDir)) {
    console.error(`[export-web] project not found: ${projectDir}`);
    process.exit(1);
  }

  const runtimePublic = path.resolve(__dirname, "..", "runtime-web", "public");
  const { ir, manifest, diagnostics } = await compileProjectFromDir(projectDir);

  // 先复制 runtime 静态文件
  await copyDir(runtimePublic, outDir);

  // 输出编译产物
  await writeJson(path.join(outDir, "game.ir.json"), ir);
  await writeJson(path.join(outDir, "manifest.json"), manifest);
  await writeJson(path.join(outDir, "diagnostics.json"), diagnostics);

  // 复制资源（保持相对路径）
  for (const asset of manifest.assets) {
    const rel = asset.path.replaceAll("\\", "/");
    const src = path.join(projectDir, rel);
    const dst = path.join(outDir, rel);
    await ensureDir(path.dirname(dst));
    await copyFile(src, dst);
  }

  // 写入一个构建标记，方便排查
  const buildInfo = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    projectDir: projectArg,
    outDir: outArg
  };
  await writeJson(path.join(outDir, "build-info.json"), buildInfo);

  // 额外检查：确保 index.html 存在（runtime 静态文件复制成功）
  const indexPath = path.join(outDir, "index.html");
  const indexStat = await stat(indexPath).catch(() => null);
  if (!indexStat) {
    console.error(`[export-web] missing index.html after copy: ${indexPath}`);
    process.exit(1);
  }

  console.log(`[export-web] OK -> ${outDir}`);
  console.log(`[export-web] Project: ${ir.project.title} (${ir.project.id})`);
  console.log(`[export-web] Assets: ${manifest.assets.length}`);
}

main().catch((e) => {
  const msg = e?.diagnostics ? "Compile failed with errors (see diagnostics below)" : "Export failed";
  console.error(`[export-web] ${msg}`);
  if (e?.diagnostics) {
    for (const d of e.diagnostics) {
      console.error(`- [${d.level}] ${d.code}: ${d.message}${d.sceneId ? ` (scene=${d.sceneId}` : ""}${d.nodeId ? ` node=${d.nodeId}` : ""}${d.sceneId ? ")" : ""}`);
    }
  }
  console.error(e);
  process.exit(1);
});

