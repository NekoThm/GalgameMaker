import { isPlainObject, normalizePosixPath } from "./shared.js";

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

function push(diagnostics, level, code, message, extra = {}) {
  diagnostics.push({ level, code, message, ...extra });
}

function requireString(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getSingleOutTarget(outgoingByNode, nodeId) {
  const edges = outgoingByNode.get(nodeId) ?? [];
  if (edges.length !== 1) return null;
  return edges[0].to.nodeId;
}

/**
 * @param {any} cond
 * @returns {{ ok: boolean; normalized?: any; message?: string }}
 */
function normalizeCondition(cond) {
  // KISS：只支持结构化条件，避免解析字符串表达式（对非程序用户更友好）
  // 支持：
  // { op: "eq"|"neq"|"gt"|"gte"|"lt"|"lte", var: "score", value: 10 }
  // { op: "truthy"|"falsy", var: "flagA" }
  // { op: "and"|"or", items: [cond, cond] }
  if (!isPlainObject(cond)) return { ok: false, message: "Condition must be an object" };
  const op = requireString(cond.op);
  if (!op) return { ok: false, message: "Condition.op is required" };

  if (op === "and" || op === "or") {
    const items = Array.isArray(cond.items) ? cond.items : null;
    if (!items || items.length < 2) return { ok: false, message: `${op} requires items[] (length >= 2)` };
    const normalizedItems = [];
    for (const item of items) {
      const r = normalizeCondition(item);
      if (!r.ok) return r;
      normalizedItems.push(r.normalized);
    }
    return { ok: true, normalized: { op, items: normalizedItems } };
  }

  if (op === "truthy" || op === "falsy") {
    const variable = requireString(cond.var);
    if (!variable) return { ok: false, message: "Condition.var is required" };
    return { ok: true, normalized: { op, var: variable } };
  }

  const variable = requireString(cond.var);
  if (!variable) return { ok: false, message: "Condition.var is required" };
  if (!("value" in cond)) return { ok: false, message: "Condition.value is required" };
  return { ok: true, normalized: { op, var: variable, value: cond.value } };
}

/**
 * @param {any} variablesDef
 * @param {string} variableName
 * @returns {boolean}
 */
function isVariableDefined(variablesDef, variableName) {
  return isPlainObject(variablesDef) && isPlainObject(variablesDef[variableName]);
}

/**
 * @param {any} variablesDef
 * @param {string} variableName
 * @returns {{ type?: string; default?: any; enumValues?: any } | null}
 */
function getVariableDef(variablesDef, variableName) {
  if (!isPlainObject(variablesDef)) return null;
  const def = variablesDef[variableName];
  if (!isPlainObject(def)) return null;
  return def;
}

/**
 * @param {any} variablesDef
 * @param {any} cond
 * @returns {{ ok: boolean; message?: string }}
 */
function validateConditionVars(variablesDef, cond) {
  if (!cond || typeof cond !== "object") return { ok: true };
  const op = cond.op;
  if (op === "and" || op === "or") {
    const items = Array.isArray(cond.items) ? cond.items : [];
    for (const item of items) {
      const r = validateConditionVars(variablesDef, item);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  const variable = cond.var;
  if (typeof variable !== "string" || !variable.trim()) return { ok: true };
  if (!isVariableDefined(variablesDef, variable)) return { ok: false, message: `Variable not defined: ${variable}` };
  return { ok: true };
}

/**
 * @param {any} node
 * @param {string} key
 * @returns {string|null}
 */
function nodeDataString(node, key) {
  if (!isPlainObject(node.data)) return null;
  return requireString(node.data[key]);
}

/**
 * @param {{
 *   sceneId: string;
 *   graph: any;
 *   variables: any;
 * }} input
 * @returns {{
 *   sceneIR: { entryNodeId: string; nodes: Record<string, any> };
 *   diagnostics: Diagnostic[];
 *   referencedAssets: Set<string>;
 * }}
 */
export function compileSceneGraph({ sceneId, graph, variables }) {
  const diagnostics = /** @type {Diagnostic[]} */ ([]);
  const referencedAssets = new Set();

  if (!isPlainObject(graph)) {
    push(diagnostics, "error", "GRAPH_INVALID", "Scene graph must be a JSON object", { sceneId });
    return { sceneIR: { entryNodeId: "", nodes: {} }, diagnostics, referencedAssets };
  }

  const nodesArray = Array.isArray(graph.nodes) ? graph.nodes : null;
  const edgesArray = Array.isArray(graph.edges) ? graph.edges : null;
  if (!nodesArray || !edgesArray) {
    push(diagnostics, "error", "GRAPH_MISSING_FIELDS", "Scene graph requires { nodes: [], edges: [] }", { sceneId });
    return { sceneIR: { entryNodeId: "", nodes: {} }, diagnostics, referencedAssets };
  }

  /** @type {Map<string, any>} */
  const nodesById = new Map();
  for (const node of nodesArray) {
    if (!isPlainObject(node)) continue;
    const id = requireString(node.id);
    const type = requireString(node.type);
    if (!id || !type) continue;
    nodesById.set(id, node);
  }

  /** @type {Map<string, { from: { nodeId: string; portId?: string }; to: { nodeId: string; portId?: string }; data?: any }[]>} */
  const outgoingByNode = new Map();
  for (const edge of edgesArray) {
    if (!isPlainObject(edge)) continue;
    const from = isPlainObject(edge.from) ? edge.from : null;
    const to = isPlainObject(edge.to) ? edge.to : null;
    const fromNodeId = from ? requireString(from.nodeId) : null;
    const toNodeId = to ? requireString(to.nodeId) : null;
    if (!fromNodeId || !toNodeId) continue;

    const fromPortId = from && typeof from.portId === "string" ? from.portId : undefined;
    const toPortId = to && typeof to.portId === "string" ? to.portId : undefined;
    const item = { from: { nodeId: fromNodeId, portId: fromPortId }, to: { nodeId: toNodeId, portId: toPortId }, data: edge.data };
    const list = outgoingByNode.get(fromNodeId) ?? [];
    list.push(item);
    outgoingByNode.set(fromNodeId, list);
  }

  const meta = isPlainObject(graph.sceneMeta) ? graph.sceneMeta : {};
  let entryNodeId = requireString(meta.entryNodeId);
  if (!entryNodeId) {
    // 回退：找 Start 节点
    for (const [id, node] of nodesById.entries()) {
      if (requireString(node.type) === "Start") {
        entryNodeId = id;
        break;
      }
    }
  }
  if (!entryNodeId) {
    push(diagnostics, "error", "SCENE_ENTRY_MISSING", "Scene entry node missing (sceneMeta.entryNodeId or Start node required)", { sceneId });
    return { sceneIR: { entryNodeId: "", nodes: {} }, diagnostics, referencedAssets };
  }

  /** @type {Map<string, string>} */
  const labelToNodeId = new Map();
  for (const [id, node] of nodesById.entries()) {
    if (requireString(node.type) !== "Label") continue;
    const name = nodeDataString(node, "name");
    if (!name) {
      push(diagnostics, "error", "LABEL_NAME_MISSING", "Label node requires data.name", { sceneId, nodeId: id });
      continue;
    }
    if (labelToNodeId.has(name)) {
      push(diagnostics, "error", "LABEL_DUPLICATE", `Duplicate label name: ${name}`, { sceneId, nodeId: id });
      continue;
    }
    labelToNodeId.set(name, id);
  }

  /** @type {Record<string, any>} */
  const compiledNodes = {};

  for (const [id, node] of nodesById.entries()) {
    const type = requireString(node.type);
    if (!type) continue;

    // 忽略纯注释/分组（不参与运行；建议不允许连线）
    if (type === "Comment" || type === "Group") {
      compiledNodes[id] = { op: "NOP", next: getSingleOutTarget(outgoingByNode, id) ?? null };
      continue;
    }

    if (type === "Start") {
      const next = getSingleOutTarget(outgoingByNode, id);
      if (!next) push(diagnostics, "error", "START_NEXT_INVALID", "Start node must have exactly 1 outgoing edge", { sceneId, nodeId: id });
      compiledNodes[id] = { op: "NOP", next };
      continue;
    }

    if (type === "End") {
      compiledNodes[id] = { op: "END" };
      continue;
    }

    if (type === "Dialogue" || type === "Narration") {
      const text = nodeDataString(node, "text");
      if (text === null) push(diagnostics, "error", "SAY_TEXT_MISSING", `${type} node requires data.text`, { sceneId, nodeId: id });
      const speaker = type === "Dialogue" ? nodeDataString(node, "speaker") : null;
      const voice = nodeDataString(node, "voice");
      const next = getSingleOutTarget(outgoingByNode, id);
      if (!next) push(diagnostics, "error", "SAY_NEXT_INVALID", `${type} node must have exactly 1 outgoing edge`, { sceneId, nodeId: id });
      if (voice) referencedAssets.add(normalizePosixPath(voice));
      compiledNodes[id] = { op: "SAY", speaker, text: text ?? "", voice: voice ? normalizePosixPath(voice) : null, next };
      continue;
    }

    if (type === "Background") {
      const bg = nodeDataString(node, "background");
      if (!bg) push(diagnostics, "error", "BG_MISSING", "Background node requires data.background (asset path)", { sceneId, nodeId: id });
      const transition = nodeDataString(node, "transition") ?? "cut";
      const durationMs = Number(isPlainObject(node.data) ? node.data.durationMs ?? 0 : 0);
      const next = getSingleOutTarget(outgoingByNode, id);
      if (!next) push(diagnostics, "error", "BG_NEXT_INVALID", "Background node must have exactly 1 outgoing edge", { sceneId, nodeId: id });
      if (bg) referencedAssets.add(normalizePosixPath(bg));
      compiledNodes[id] = {
        op: "SET_BG",
        background: bg ? normalizePosixPath(bg) : null,
        transition,
        durationMs: Number.isFinite(durationMs) ? durationMs : 0,
        next
      };
      continue;
    }

    if (type === "Character") {
      const action = nodeDataString(node, "action") ?? "show";
      const characterId = nodeDataString(node, "characterId");
      if (!characterId) push(diagnostics, "error", "CHARACTER_ID_MISSING", "Character node requires data.characterId", { sceneId, nodeId: id });
      const appearance = nodeDataString(node, "appearance"); // static image or live2d model entry
      const renderer = nodeDataString(node, "renderer") ?? "static"; // "static"|"live2d"
      const position = isPlainObject(node.data) && isPlainObject(node.data.position) ? node.data.position : { anchor: "center", x: 0.5, y: 1.0 };
      const scale = Number(isPlainObject(node.data) ? node.data.scale ?? 1 : 1);
      const next = getSingleOutTarget(outgoingByNode, id);
      if (!next) push(diagnostics, "error", "CHAR_NEXT_INVALID", "Character node must have exactly 1 outgoing edge", { sceneId, nodeId: id });
      if (appearance) referencedAssets.add(normalizePosixPath(appearance));
      compiledNodes[id] = {
        op: "CHAR",
        action,
        characterId: characterId ?? "",
        renderer,
        appearance: appearance ? normalizePosixPath(appearance) : null,
        position,
        scale: Number.isFinite(scale) ? scale : 1,
        next
      };
      continue;
    }

    if (type === "BGM" || type === "SFX" || type === "Voice") {
      const audio = nodeDataString(node, "audio");
      if (!audio) push(diagnostics, "error", "AUDIO_MISSING", `${type} node requires data.audio (asset path)`, { sceneId, nodeId: id });
      const action = nodeDataString(node, "action") ?? "play"; // play/stop
      const volume = Number(isPlainObject(node.data) ? node.data.volume ?? 1 : 1);
      const loop = Boolean(isPlainObject(node.data) ? node.data.loop ?? (type === "BGM") : type === "BGM");
      const fadeMs = Number(isPlainObject(node.data) ? node.data.fadeMs ?? 0 : 0);
      const next = getSingleOutTarget(outgoingByNode, id);
      if (!next) push(diagnostics, "error", "AUDIO_NEXT_INVALID", `${type} node must have exactly 1 outgoing edge`, { sceneId, nodeId: id });
      if (audio) referencedAssets.add(normalizePosixPath(audio));
      compiledNodes[id] = {
        op: "AUDIO",
        channel: type.toLowerCase(),
        action,
        audio: audio ? normalizePosixPath(audio) : null,
        volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1,
        loop,
        fadeMs: Number.isFinite(fadeMs) ? Math.max(0, fadeMs) : 0,
        next
      };
      continue;
    }

    if (type === "SetVariable") {
      const name = nodeDataString(node, "name");
      const op = nodeDataString(node, "op") ?? "set"; // set/add
      const value = isPlainObject(node.data) ? node.data.value : undefined;
      if (!name) push(diagnostics, "error", "VAR_NAME_MISSING", "SetVariable node requires data.name", { sceneId, nodeId: id });
      const varDef = name ? getVariableDef(variables, name) : null;
      if (name && !varDef) push(diagnostics, "error", "VAR_UNDEFINED", `Variable not defined: ${name}`, { sceneId, nodeId: id });
      if (name && varDef) {
        const varType = typeof varDef.type === "string" ? varDef.type : "unknown";
        if (op === "add" && varType !== "number") {
          push(diagnostics, "error", "VAR_TYPE_MISMATCH", `Operation 'add' requires number variable, got: ${varType}`, { sceneId, nodeId: id });
        }
        if (op === "set") {
          if (varType === "flag" && typeof value !== "boolean") {
            push(diagnostics, "error", "VAR_TYPE_MISMATCH", "Setting flag requires boolean value", { sceneId, nodeId: id });
          }
          if (varType === "number" && typeof value !== "number") {
            push(diagnostics, "error", "VAR_TYPE_MISMATCH", "Setting number requires numeric value", { sceneId, nodeId: id });
          }
          if (varType === "enum") {
            const values = Array.isArray(varDef.enumValues) ? varDef.enumValues : [];
            if (typeof value !== "string" || (values.length > 0 && !values.includes(value))) {
              push(diagnostics, "error", "VAR_TYPE_MISMATCH", "Setting enum requires a valid string enum value", { sceneId, nodeId: id });
            }
          }
        }
      }
      const next = getSingleOutTarget(outgoingByNode, id);
      if (!next) push(diagnostics, "error", "VAR_NEXT_INVALID", "SetVariable node must have exactly 1 outgoing edge", { sceneId, nodeId: id });
      compiledNodes[id] = { op: "SET_VAR", name: name ?? "", opType: op, value, next };
      continue;
    }

    if (type === "Branch") {
      const data = isPlainObject(node.data) ? node.data : {};
      const condRaw = data.cond;
      const cond = normalizeCondition(condRaw);
      if (!cond.ok) {
        push(diagnostics, "error", "BRANCH_COND_INVALID", `Branch condition invalid: ${cond.message}`, { sceneId, nodeId: id });
      } else {
        const v = validateConditionVars(variables, cond.normalized);
        if (!v.ok) push(diagnostics, "error", "BRANCH_VAR_UNDEFINED", v.message ?? "Branch condition uses undefined variable", { sceneId, nodeId: id });
      }
      const edges = outgoingByNode.get(id) ?? [];
      const thenEdge = edges.find((e) => e.from.portId === "then") ?? null;
      const elseEdge = edges.find((e) => e.from.portId === "else") ?? null;
      if (!thenEdge || !elseEdge) {
        push(diagnostics, "error", "BRANCH_OUT_INVALID", "Branch node must have outgoing edges from ports 'then' and 'else'", { sceneId, nodeId: id });
      }
      compiledNodes[id] = {
        op: "IF",
        cond: cond.ok ? cond.normalized : null,
        then: thenEdge ? thenEdge.to.nodeId : null,
        else: elseEdge ? elseEdge.to.nodeId : null
      };
      continue;
    }

    if (type === "Choice") {
      const edges = outgoingByNode.get(id) ?? [];
      if (edges.length < 2) {
        push(diagnostics, "error", "CHOICE_OUT_TOO_FEW", "Choice node must have at least 2 outgoing edges", { sceneId, nodeId: id });
      }
      const choices = [];
      for (const e of edges) {
        const t = isPlainObject(e.data) ? e.data : {};
        const text = requireString(t.text);
        if (!text) {
          push(diagnostics, "error", "CHOICE_TEXT_MISSING", "Choice outgoing edge requires edge.data.text", { sceneId, nodeId: id });
          continue;
        }
        choices.push({ text, to: e.to.nodeId });
      }
      compiledNodes[id] = { op: "CHOICE", choices };
      continue;
    }

    if (type === "Jump") {
      const targetLabel = nodeDataString(node, "targetLabel");
      if (!targetLabel) push(diagnostics, "error", "JUMP_TARGET_MISSING", "Jump node requires data.targetLabel", { sceneId, nodeId: id });
      const targetNodeId = targetLabel ? labelToNodeId.get(targetLabel) : null;
      if (targetLabel && !targetNodeId) {
        push(diagnostics, "error", "JUMP_LABEL_NOT_FOUND", `Label not found: ${targetLabel}`, { sceneId, nodeId: id });
      }
      compiledNodes[id] = { op: "JUMP", to: targetNodeId ?? null };
      continue;
    }

    if (type === "Label") {
      const next = getSingleOutTarget(outgoingByNode, id);
      if (!next) push(diagnostics, "error", "LABEL_NEXT_INVALID", "Label node must have exactly 1 outgoing edge", { sceneId, nodeId: id });
      compiledNodes[id] = { op: "NOP", next };
      continue;
    }

    // 未知节点类型：按错误处理，避免运行时不确定行为
    push(diagnostics, "error", "NODE_TYPE_UNKNOWN", `Unknown node type: ${type}`, { sceneId, nodeId: id });
  }

  // Reachability（不可达作为 warning）
  /** @type {Set<string>} */
  const visited = new Set();
  const stack = [entryNodeId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const n = compiledNodes[current];
    if (!n) continue;
    if (n.op === "END") continue;
    if (n.op === "CHOICE") {
      for (const c of n.choices ?? []) stack.push(c.to);
      continue;
    }
    if (n.op === "IF") {
      stack.push(n.then);
      stack.push(n.else);
      continue;
    }
    if (n.op === "JUMP") {
      stack.push(n.to);
      continue;
    }
    if ("next" in n) stack.push(n.next);
  }

  for (const nodeId of Object.keys(compiledNodes)) {
    if (!visited.has(nodeId)) {
      push(diagnostics, "warning", "NODE_UNREACHABLE", "Node is unreachable from entry", { sceneId, nodeId });
    }
  }

  return { sceneIR: { entryNodeId, nodes: compiledNodes }, diagnostics, referencedAssets };
}
