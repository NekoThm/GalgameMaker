import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { GalgameCompileError, isPlainObject, normalizePosixPath } from "./shared.js";
import { compileSceneGraph } from "./scene-compiler.js";

/**
 * @typedef {{
 *   level: "error" | "warning";
 *   code: string;
 *   message: string;
 *   projectPath?: string;
 *   sceneId?: string;
 *   nodeId?: string;
 * }} Diagnostic
 */

/**
 * @typedef {{
 *   project: {
 *     id: string;
 *     title: string;
 *     resolution: { width: number; height: number };
 *     entry: { sceneId: string };
 *   };
 *   variables: Record<string, { type: "flag" | "number" | "enum"; default: any; description?: string; enumValues?: string[] }>;
 *   scenes: Record<string, { entryNodeId: string; nodes: Record<string, any> }>;
 *   schemaVersion: 1;
 * }} GameIR
 */

/**
 * @typedef {{
 *   schemaVersion: 1;
 *   assets: { path: string; type: "image" | "audio" | "live2d" | "other" }[];
 * }} Manifest
 */

async function readJsonFile(filePath) {
  const text = await readFile(filePath, "utf-8");
  const data = JSON.parse(text);
  if (!isPlainObject(data)) {
    throw new Error(`Expected JSON object: ${filePath}`);
  }
  return data;
}

function fileExists(filePath) {
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function push(diagnostics, level, code, message, extra = {}) {
  diagnostics.push({ level, code, message, ...extra });
}

function toAssetType(assetPath) {
  const ext = path.extname(assetPath).toLowerCase();
  if (ext === ".svg" || ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") return "image";
  if (ext === ".mp3" || ext === ".wav" || ext === ".ogg") return "audio";
  if (ext === ".json" && assetPath.toLowerCase().includes("/live2d/")) return "live2d";
  return "other";
}

/**
 * 读取项目目录，编译所有场景图为运行态 IR，并生成资源清单。
 *
 * 约定：
 * - project.json 至少包含：id/title/resolution/entry/scenes
 * - scenes[] 每项包含：id, graph (相对 projectDir 的路径)
 *
 * @param {string} projectDir
 * @returns {Promise<{ ir: GameIR; manifest: Manifest; diagnostics: Diagnostic[] }>}
 */
export async function compileProjectFromDir(projectDir) {
  const diagnostics = /** @type {Diagnostic[]} */ ([]);
  const projectPath = path.join(projectDir, "project.json");

  if (!fileExists(projectPath)) {
    throw new GalgameCompileError(`Missing project.json: ${projectPath}`);
  }

  const project = await readJsonFile(projectPath);
  const id = typeof project.id === "string" && project.id.trim() ? project.id : "my-game";
  const title = typeof project.title === "string" && project.title.trim() ? project.title : "My Game";

  const resolution = isPlainObject(project.resolution) ? project.resolution : {};
  const width = Number(resolution.width ?? 1280);
  const height = Number(resolution.height ?? 720);

  const entry = isPlainObject(project.entry) ? project.entry : {};
  const entrySceneId = typeof entry.sceneId === "string" ? entry.sceneId : null;
  if (!entrySceneId) {
    push(diagnostics, "error", "PROJECT_ENTRY_MISSING", "project.entry.sceneId is required", { projectPath: "project.json" });
  }

  const scenesArray = Array.isArray(project.scenes) ? project.scenes : [];
  if (scenesArray.length === 0) {
    push(diagnostics, "error", "PROJECT_SCENES_EMPTY", "project.scenes must be a non-empty array", { projectPath: "project.json" });
  }

  const variablesPath = path.join(projectDir, "variables.json");
  const variables = fileExists(variablesPath) ? await readJsonFile(variablesPath) : {};
  if (!isPlainObject(variables)) {
    push(diagnostics, "error", "VARIABLES_INVALID", "variables.json must be a JSON object", { projectPath: "variables.json" });
  }

  /** @type {Record<string, any>} */
  const scenes = {};

  /** @type {Set<string>} */
  const assetPaths = new Set();

  for (const scene of scenesArray) {
    if (!isPlainObject(scene)) {
      push(diagnostics, "error", "SCENE_INVALID", "Each item in project.scenes must be an object", { projectPath: "project.json" });
      continue;
    }
    const sceneId = typeof scene.id === "string" ? scene.id : null;
    const graphRel = typeof scene.graph === "string" ? scene.graph : null;
    if (!sceneId || !graphRel) {
      push(diagnostics, "error", "SCENE_MISSING_FIELDS", "Scene requires { id, graph }", { projectPath: "project.json" });
      continue;
    }

    const graphPath = path.join(projectDir, graphRel);
    if (!fileExists(graphPath)) {
      push(diagnostics, "error", "SCENE_GRAPH_MISSING", `Missing scene graph: ${graphRel}`, {
        projectPath: normalizePosixPath(graphRel),
        sceneId
      });
      continue;
    }

    const graph = await readJsonFile(graphPath);
    const { sceneIR, diagnostics: sceneDiagnostics, referencedAssets } = compileSceneGraph({
      sceneId,
      graph,
      variables
    });

    for (const diag of sceneDiagnostics) diagnostics.push(diag);
    for (const p of referencedAssets) assetPaths.add(p);

    scenes[sceneId] = sceneIR;
  }

  if (entrySceneId && !scenes[entrySceneId]) {
    push(diagnostics, "error", "PROJECT_ENTRY_SCENE_NOT_FOUND", `Entry scene not found: ${entrySceneId}`, {
      projectPath: "project.json"
    });
  }

  // 资源存在性校验（exporter 会复制这些资源；缺失则阻断导出）
  for (const assetRel of assetPaths) {
    const rel = normalizePosixPath(assetRel);
    const abs = path.join(projectDir, rel);
    if (!fileExists(abs)) {
      push(diagnostics, "error", "ASSET_MISSING", `Asset file missing: ${rel}`, { projectPath: rel });
    }
  }

  const hasErrors = diagnostics.some((d) => d.level === "error");
  if (hasErrors) {
    throw new GalgameCompileError("Compile failed with errors", { diagnostics });
  }

  /** @type {GameIR} */
  const ir = {
    schemaVersion: 1,
    project: {
      id,
      title,
      resolution: { width, height },
      entry: { sceneId: entrySceneId }
    },
    variables,
    scenes
  };

  /** @type {Manifest} */
  const manifest = {
    schemaVersion: 1,
    assets: Array.from(assetPaths)
      .sort()
      .map((p) => ({ path: normalizePosixPath(p), type: toAssetType(p) }))
  };

  return { ir, manifest, diagnostics };
}

