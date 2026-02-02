import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, copyFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { compileProjectFromDir } from "../core/src/project-compiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export async function exportWeb({ projectDir, outDir }) {
  const projectAbs = path.resolve(process.cwd(), projectDir);
  const outAbs = path.resolve(process.cwd(), outDir);

  if (!existsSync(projectAbs)) {
    throw new Error(`Project not found: ${projectAbs}`);
  }

  const runtimePublic = path.resolve(__dirname, "..", "runtime-web", "public");
  const { ir, manifest, diagnostics } = await compileProjectFromDir(projectAbs);

  await copyDir(runtimePublic, outAbs);
  await writeJson(path.join(outAbs, "game.ir.json"), ir);
  await writeJson(path.join(outAbs, "manifest.json"), manifest);
  await writeJson(path.join(outAbs, "diagnostics.json"), diagnostics);

  for (const asset of manifest.assets) {
    const rel = asset.path.replaceAll("\\", "/");
    const src = path.join(projectAbs, rel);
    const dst = path.join(outAbs, rel);
    await ensureDir(path.dirname(dst));
    await copyFile(src, dst);
  }

  const buildInfo = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    projectDir,
    outDir
  };
  await writeJson(path.join(outAbs, "build-info.json"), buildInfo);

  const indexPath = path.join(outAbs, "index.html");
  const indexStat = await stat(indexPath).catch(() => null);
  if (!indexStat) {
    throw new Error(`Missing index.html after copy: ${indexPath}`);
  }

  return { outDir: outAbs, ir, manifest, diagnostics };
}
