const api = window.editorApi ?? null;

const els = {
  btnOpen: document.getElementById("btnOpen"),
  btnToggleLeft: document.getElementById("btnToggleLeft"),
  btnReload: document.getElementById("btnReload"),
  btnFormat: document.getElementById("btnFormat"),
  btnAddNode: document.getElementById("btnAddNode"),
  btnAddScene: document.getElementById("btnAddScene"),
  btnSceneCreateOk: document.getElementById("btnSceneCreateOk"),
  btnSceneCreateCancel: document.getElementById("btnSceneCreateCancel"),
  btnSave: document.getElementById("btnSave"),
  btnCompile: document.getElementById("btnCompile"),
  btnExport: document.getElementById("btnExport"),
  btnPreview: document.getElementById("btnPreview"),
  btnChooseOut: document.getElementById("btnChooseOut"),
  nodeTypeSelect: document.getElementById("nodeTypeSelect"),
  projectPath: document.getElementById("projectPath"),
  sceneList: document.getElementById("sceneList"),
  variablesList: document.getElementById("variablesList"),
  varNameInput: document.getElementById("varNameInput"),
  varTypeSelect: document.getElementById("varTypeSelect"),
  varDefaultInput: document.getElementById("varDefaultInput"),
  varEnumDefaultSelect: document.getElementById("varEnumDefaultSelect"),
  varFlagDefaultSelect: document.getElementById("varFlagDefaultSelect"),
  varEnumEditor: document.getElementById("varEnumEditor"),
  varEnumValueInput: document.getElementById("varEnumValueInput"),
  btnAddEnumValue: document.getElementById("btnAddEnumValue"),
  varEnumList: document.getElementById("varEnumList"),
  btnVarCreateOk: document.getElementById("btnVarCreateOk"),
  btnVarCreateCancel: document.getElementById("btnVarCreateCancel"),
  btnAddVar: document.getElementById("btnAddVar"),
  diagnostics: document.getElementById("diagnostics"),
  outDir: document.getElementById("outDir"),
  status: document.getElementById("status"),
  graphViewport: document.getElementById("graphViewport"),
  graphCanvas: document.getElementById("graphCanvas"),
  graphEdges: document.getElementById("graphEdges"),
  graphNodes: document.getElementById("graphNodes"),
  inspector: document.getElementById("inspector"),
  leftPanel: document.getElementById("leftPanel"),
  rightPanel: document.getElementById("rightPanel")
};
els.sceneModal = document.getElementById("sceneModal");
els.sceneModalBackdrop = document.querySelector("#sceneModal .modal-backdrop");
els.sceneIdInput = document.getElementById("sceneIdInput");
els.varModal = document.getElementById("varModal");
els.varModalBackdrop = document.querySelector("#varModal .modal-backdrop");
els.scenePreviewPanel = document.getElementById("scenePreviewPanel");
els.scenePreview = document.getElementById("scenePreview");
els.scenePreviewInfo = document.getElementById("scenePreviewInfo");

const state = {
  projectDir: null,
  project: null,
  variables: {},
  currentScene: null,
  currentGraphPath: null,
  currentLayoutPath: null,
  graph: null,
  layout: null,
  selectedNodeId: null,
  dirtyGraph: false,
  dirtyLayout: false,
  nodeElements: new Map(),
  nodePorts: new Map(),
  canvasOffset: { x: 0, y: 0 },
  viewport: { x: 0, y: 0, zoom: 1 },
  autoFit: true,
  connecting: null,
  enumDraft: []
};

const NODE_SCHEMA = {
  Start: { label: "起点", fields: [] },
  End: { label: "结局", fields: [] },
  Dialogue: {
    label: "对白",
    fields: [
      { key: "speaker", label: "角色名", type: "text" },
      { key: "text", label: "文本", type: "textarea" },
      { key: "voice", label: "语音资源", type: "path" }
    ]
  },
  Narration: {
    label: "旁白",
    fields: [
      { key: "text", label: "文本", type: "textarea" },
      { key: "voice", label: "语音资源", type: "path" }
    ]
  },
  Background: {
    label: "背景",
    fields: [
      { key: "background", label: "背景资源", type: "path" },
      {
        key: "transition",
        label: "切换方式",
        type: "select",
        options: [
          { value: "cut", label: "切换" },
          { value: "fade", label: "淡入淡出" }
        ]
      },
      { key: "durationMs", label: "时长(ms)", type: "number" }
    ]
  },
  Character: {
    label: "立绘",
    fields: [
      { key: "action", label: "动作", type: "select", options: ["show", "hide"] },
      { key: "characterId", label: "角色ID", type: "text" },
      { key: "renderer", label: "渲染器", type: "select", options: ["static", "live2d"] },
      { key: "appearance", label: "资源路径", type: "path" },
      { key: "position.x", label: "位置X(0-1)", type: "number" },
      { key: "position.y", label: "位置Y(0-1)", type: "number" },
      { key: "scale", label: "缩放", type: "number" }
    ]
  },
  Choice: { label: "选项", fields: [] },
  Branch: { label: "条件分支", fields: [] },
  SetVariable: { label: "变量设置", fields: [] },
  SwitchScene: {
    label: "切换场景",
    fields: [
      { key: "sceneId", label: "目标场景", type: "scene-select" },
      { key: "nodeId", label: "目标节点(可选)", type: "text" }
    ]
  },
  Jump: { label: "跳转", fields: [{ key: "targetLabel", label: "目标标签", type: "label-select" }] },
  Label: { label: "标签", fields: [{ key: "name", label: "标签名", type: "text" }] },
  BGM: {
    label: "BGM",
    fields: [
      { key: "audio", label: "音频资源", type: "path" },
      { key: "action", label: "动作", type: "select", options: ["play", "stop"] },
      { key: "volume", label: "音量(0-1)", type: "number" },
      { key: "loop", label: "循环", type: "boolean" },
      { key: "fadeMs", label: "淡入淡出(ms)", type: "number" }
    ]
  },
  SFX: {
    label: "音效",
    fields: [
      { key: "audio", label: "音频资源", type: "path" },
      { key: "action", label: "动作", type: "select", options: ["play", "stop"] },
      { key: "volume", label: "音量(0-1)", type: "number" },
      { key: "fadeMs", label: "淡入淡出(ms)", type: "number" }
    ]
  },
  Voice: {
    label: "语音",
    fields: [
      { key: "audio", label: "音频资源", type: "path" },
      { key: "action", label: "动作", type: "select", options: ["play", "stop"] },
      { key: "volume", label: "音量(0-1)", type: "number" }
    ]
  },
  Comment: { label: "注释", fields: [] },
  Group: { label: "分组", fields: [] }
};

const NODE_TYPE_ORDER = [
  "Start",
  "Dialogue",
  "Narration",
  "Choice",
  "Branch",
  "SetVariable",
  "SwitchScene",
  "Jump",
  "Label",
  "Background",
  "Character",
  "BGM",
  "SFX",
  "Voice",
  "Comment",
  "Group",
  "End"
];

function setStatus(message, type = "info") {
  els.status.textContent = message;
  if (type === "error") els.status.style.color = "var(--danger)";
  else if (type === "warn") els.status.style.color = "#e0af68";
  else els.status.style.color = "var(--muted)";
}

function clearDiagnostics() {
  els.diagnostics.innerHTML = "<div class=\"muted\">无诊断</div>";
}

function renderDiagnostics(list) {
  if (!list || list.length === 0) {
    clearDiagnostics();
    return;
  }
  const items = list.map((d) => {
    const levelClass = d.level === "error" ? "diag-error" : "diag-warning";
    const location = [d.sceneId ? `scene=${d.sceneId}` : null, d.nodeId ? `node=${d.nodeId}` : null]
      .filter(Boolean)
      .join(" ");
    return `<div class="diag-item ${levelClass}">[${d.level}] ${d.code}: ${escapeHtml(d.message)} ${
      location ? `<span class="muted">(${location})</span>` : ""
    }</div>`;
  });
  els.diagnostics.innerHTML = items.join("");
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function getNodeById(nodeId) {
  if (!state.graph) return null;
  return state.graph.nodes.find((n) => n.id === nodeId) ?? null;
}

function getEntryNodeId() {
  if (!state.graph) return null;
  const metaId = state.graph.sceneMeta?.entryNodeId;
  if (metaId && getNodeById(metaId)) return metaId;
  const start = state.graph.nodes.find((n) => n.type === "Start");
  return start?.id ?? state.graph.nodes[0]?.id ?? null;
}

function getLayoutNode(nodeId) {
  if (!state.layout || !state.layout.nodes) return null;
  return state.layout.nodes[nodeId] ?? null;
}

function setLayoutNode(nodeId, value) {
  if (!state.layout.nodes) state.layout.nodes = {};
  state.layout.nodes[nodeId] = value;
  state.dirtyLayout = true;
}

function getByPath(obj, path) {
  if (!obj) return undefined;
  const parts = path.split(".");
  let current = obj;
  for (const p of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[p];
  }
  return current;
}

function setByPath(obj, path, value) {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    if (i === parts.length - 1) {
      current[p] = value;
      return;
    }
    if (!current[p] || typeof current[p] !== "object") current[p] = {};
    current = current[p];
  }
}

function computeLayoutPath(graphRel) {
  if (graphRel.endsWith(".graph.json")) return graphRel.replace(".graph.json", ".layout.json");
  return `${graphRel}.layout.json`;
}

function summarizeNode(node) {
  const type = node.type ?? "Unknown";
  if (type === "Dialogue" || type === "Narration") {
    const text = node.data?.text ?? "";
    return text.length > 24 ? `${text.slice(0, 24)}…` : text;
  }
  if (type === "Background") return node.data?.background ?? "";
  if (type === "Character") return `${node.data?.characterId ?? ""}`;
  if (type === "Choice") return "选项";
  if (type === "Branch") return "条件分支";
  if (type === "SetVariable") return node.data?.name ?? "";
  if (type === "SwitchScene") return node.data?.sceneId ?? "";
  if (type === "Jump") return node.data?.targetLabel ?? "";
  if (type === "Label") return node.data?.name ?? "";
  return "";
}

function getChoiceLabels(nodeId) {
  const edges = getOutgoingEdges(nodeId);
  if (edges.length === 0) return [];
  return edges.map((edge, index) => {
    const text = edge?.data?.text ?? "";
    const fallback = `选项${index + 1}`;
    return text || fallback;
  });
}

function updateChoiceInlineList(nodeId) {
  const nodeEl = state.nodeElements.get(nodeId);
  if (!nodeEl) return;
  const list = nodeEl.querySelector(".choice-list");
  if (!list) return;
  const labels = getChoiceLabels(nodeId);
  list.innerHTML = "";
  for (const label of labels) {
    const item = document.createElement("div");
    item.className = "choice-item";
    item.textContent = label;
    item.title = label;
    list.appendChild(item);
  }
  requestAnimationFrame(() => {
    const ports = state.nodePorts.get(nodeId);
    if (!ports) return;
    layoutPorts(nodeEl, ports);
    renderEdges();
  });
}

function createDefaultNodeData(type) {
  if (type === "Dialogue") return { speaker: "", text: "" };
  if (type === "Narration") return { text: "" };
  if (type === "Background") return { background: "", transition: "cut", durationMs: 0 };
  if (type === "Character")
    return { action: "show", characterId: "", renderer: "static", appearance: "", position: { x: 0.5, y: 1, anchor: "bottom" }, scale: 1 };
  if (type === "SetVariable") return { name: "", op: "set", value: 0 };
  if (type === "Branch") return { cond: { op: "truthy", var: "" } };
  if (type === "SwitchScene") return { sceneId: "", nodeId: "" };
  if (type === "Jump") return { targetLabel: "" };
  if (type === "Label") return { name: "" };
  if (type === "BGM") return { audio: "", action: "play", volume: 1, loop: true, fadeMs: 0 };
  if (type === "SFX") return { audio: "", action: "play", volume: 1, fadeMs: 0 };
  if (type === "Voice") return { audio: "", action: "play", volume: 1 };
  return {};
}

function generateNodeId(type) {
  const base = `n_${type.toLowerCase()}`;
  let index = 1;
  let id = base;
  const exists = (candidate) => state.graph?.nodes?.some((n) => n.id === candidate);
  while (exists(id)) {
    index += 1;
    id = `${base}_${index}`;
  }
  return id;
}

function cloneNodeData(data) {
  if (!data || typeof data !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return {};
  }
}

function addNodeAt(type, position) {
  if (!state.graph || !state.layout) return;
  const nodeId = generateNodeId(type);
  const node = {
    id: nodeId,
    type,
    data: createDefaultNodeData(type)
  };
  if (!Array.isArray(state.graph.nodes)) state.graph.nodes = [];
  if (!Array.isArray(state.graph.edges)) state.graph.edges = [];
  if (!state.graph.sceneMeta) state.graph.sceneMeta = {};
  if (!state.layout.nodes) state.layout.nodes = {};

  state.graph.nodes.push(node);
  state.layout.nodes[nodeId] = { x: position.x, y: position.y };

  if (!state.graph.sceneMeta.entryNodeId && type === "Start") {
    state.graph.sceneMeta.entryNodeId = nodeId;
  }

  state.dirtyGraph = true;
  state.dirtyLayout = true;

  renderGraph();
  selectNode(nodeId);
  setStatus(`已新增节点：${type}`);
}

function duplicateNode(nodeId) {
  if (!state.graph || !state.layout || !nodeId) return;
  const source = getNodeById(nodeId);
  if (!source) return;
  const newId = generateNodeId(source.type ?? "Node");
  const node = {
    id: newId,
    type: source.type ?? "Unknown",
    data: cloneNodeData(source.data)
  };
  if (!Array.isArray(state.graph.nodes)) state.graph.nodes = [];
  if (!state.layout.nodes) state.layout.nodes = {};
  state.graph.nodes.push(node);
  const pos = getLayoutNode(nodeId) ?? { x: 0, y: 0 };
  state.layout.nodes[newId] = { x: (pos?.x ?? 0) + 24, y: (pos?.y ?? 0) + 24 };
  state.dirtyGraph = true;
  state.dirtyLayout = true;
  renderGraph();
  selectNode(newId);
  setStatus(`已复制节点：${nodeId} → ${newId}`);
}

function deleteNode(nodeId) {
  if (!state.graph || !state.layout || !nodeId) return;
  const node = getNodeById(nodeId);
  if (!node) return;

  state.graph.nodes = state.graph.nodes.filter((n) => n.id !== nodeId);
  state.graph.edges = (state.graph.edges ?? []).filter((e) => e.from?.nodeId !== nodeId && e.to?.nodeId !== nodeId);
  if (state.layout.nodes && state.layout.nodes[nodeId]) delete state.layout.nodes[nodeId];

  if (state.graph.sceneMeta?.entryNodeId === nodeId) {
    state.graph.sceneMeta.entryNodeId = state.graph.nodes[0]?.id ?? "";
  }

  state.selectedNodeId = null;
  state.dirtyGraph = true;
  state.dirtyLayout = true;
  renderGraph();
  renderInspector(null);
  setStatus(`已删除节点：${nodeId}`);
}

function buildPortLayout(node) {
  const type = node.type ?? "Unknown";
  const outgoing = getOutgoingEdges(node.id);
  const incoming = getIncomingEdges(node.id);

  let inputCount = 0;
  let outputPorts = [];

  const hasInput = !["Start"].includes(type);
  const hasOutput = !["End", "SwitchScene"].includes(type);

  inputCount = hasInput ? Math.max(1, incoming.length || 1) : 0;

  if (!hasOutput) {
    outputPorts = [];
  } else if (type === "Branch") {
    outputPorts = [
      { id: "then", label: "then" },
      { id: "else", label: "else" }
    ];
  } else if (type === "Choice") {
    outputPorts = outgoing.map((edge, index) => ({
      id: edge?.from?.portId && edge.from.portId !== "out" ? edge.from.portId : `out-${index + 1}`,
      label: edge?.data?.text ?? `选项${index + 1}`,
      edgeId: edge.id
    }));
    if (outputPorts.length === 0) {
      outputPorts = [{ id: "out-1", label: "选项1" }];
    }
  } else {
    outputPorts = [{ id: "out", label: "" }];
  }

  const inputPorts = [];
  const orderedIncoming = incoming.slice().sort((a, b) => {
    const aKey = getEdgeSourceOrder(a);
    const bKey = getEdgeSourceOrder(b);
    if (aKey.y !== bKey.y) return aKey.y - bKey.y;
    if (aKey.x !== bKey.x) return aKey.x - bKey.x;
    return String(a.id).localeCompare(String(b.id));
  });
  for (let i = 0; i < inputCount; i += 1) {
    inputPorts.push({
      id: i === 0 ? "in" : `in-${i + 1}`,
      label: "",
      edgeId: null
    });
  }

  for (let i = 0; i < Math.min(orderedIncoming.length, inputPorts.length); i += 1) {
    inputPorts[i].edgeId = orderedIncoming[i].id;
  }

  return { inputs: inputPorts, outputs: outputPorts };
}

function getEdgeSourceOrder(edge) {
  const fromId = edge?.from?.nodeId;
  const fromPos = state.layout?.nodes?.[fromId];
  let y = fromPos?.y ?? 0;
  let x = fromPos?.x ?? 0;
  const ports = state.nodePorts.get(fromId);
  if (ports) {
    const port = resolveOutputPort(ports, edge);
    if (port) {
      y += port.offsetY ?? 0;
      x += port.offsetX ?? 0;
    }
  }
  return { x, y };
}

function layoutPorts(nodeEl, ports) {
  const height = nodeEl.offsetHeight || 80;
  const width = nodeEl.offsetWidth || 180;

  const apply = (list, direction) => {
    const count = list.length;
    list.forEach((port, index) => {
      const el = port.el;
      const ratio = (index + 1) / (count + 1);
      const y = Math.max(8, Math.min(height - 8, height * ratio));
      const x = direction === "in" ? 0 : width;
      port.offsetX = x;
      port.offsetY = y;
      el.style.top = `${y - 5}px`;
      if (direction === "in") el.style.left = `-6px`;
      else el.style.right = `-6px`;
    });
  };

  apply(ports.inputs, "in");
  apply(ports.outputs, "out");
}

function applyTransform() {
  const { x, y, zoom } = state.viewport;
  els.graphCanvas.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
  renderEdges();
}

function ensureLayoutForNodes() {
  if (!state.layout.nodes) state.layout.nodes = {};
  let index = 0;
  for (const node of state.graph.nodes) {
    if (!state.layout.nodes[node.id]) {
      const x = 80 + (index % 6) * 260;
      const y = 60 + Math.floor(index / 6) * 180;
      state.layout.nodes[node.id] = { x, y };
      index += 1;
    }
  }
}

function updateCanvasBounds() {
  const positions = Object.values(state.layout.nodes ?? {});
  if (positions.length === 0) {
    state.canvasOffset = { x: 300, y: 220 };
    els.graphCanvas.style.width = "1600px";
    els.graphCanvas.style.height = "1000px";
    return;
  }

  const defaultW = 200;
  const defaultH = 90;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pos of positions) {
    const x = pos?.x ?? 0;
    const y = pos?.y ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + defaultW);
    maxY = Math.max(maxY, y + defaultH);
  }

  const margin = 320;
  const newOffset = { x: -minX + margin, y: -minY + margin };
  const deltaX = newOffset.x - state.canvasOffset.x;
  const deltaY = newOffset.y - state.canvasOffset.y;
  if (deltaX !== 0 || deltaY !== 0) {
    state.viewport.x -= deltaX * state.viewport.zoom;
    state.viewport.y -= deltaY * state.viewport.zoom;
    state.layout.viewport = { ...state.viewport };
  }

  state.canvasOffset = newOffset;
  const width = Math.max(1200, maxX - minX + margin * 2);
  const height = Math.max(800, maxY - minY + margin * 2);
  els.graphCanvas.style.width = `${width}px`;
  els.graphCanvas.style.height = `${height}px`;
}

function refreshPortLayout() {
  if (!state.graph) return;
  for (const node of state.graph.nodes) {
    const nodeEl = state.nodeElements.get(node.id);
    if (!nodeEl) continue;
    const ports = buildPortLayout(node);
    // 清理旧端口
    nodeEl.querySelectorAll(".port").forEach((el) => el.remove());
    for (const port of ports.inputs) {
      const portEl = document.createElement("div");
      portEl.className = "port port-in";
      portEl.dataset.portId = port.id;
      if (port.edgeId) portEl.dataset.edgeId = port.edgeId;
      portEl.title = port.label || port.id;
      portEl.addEventListener("pointerup", (e) => onInputPortPointerUp(e, node.id, port.id));
      nodeEl.appendChild(portEl);
      port.el = portEl;
    }
    for (const port of ports.outputs) {
      const portEl = document.createElement("div");
      portEl.className = "port port-out";
      portEl.dataset.portId = port.id;
      if (port.edgeId) portEl.dataset.edgeId = port.edgeId;
      portEl.title = port.label || port.id;
      if (port.label) {
        const label = document.createElement("span");
        label.className = "port-label";
        label.textContent = port.label;
        portEl.appendChild(label);
      }
      portEl.addEventListener("pointerdown", (e) => onOutputPortPointerDown(e, node.id, port));
      nodeEl.appendChild(portEl);
      port.el = portEl;
    }
    layoutPorts(nodeEl, ports);
    state.nodePorts.set(node.id, ports);
    if (node.type === "Choice") {
      updateChoiceInlineList(node.id);
    }
  }
  renderEdges();
}

function renderGraph() {
  if (!state.graph || !state.layout) return;
  ensureLayoutForNodes();
  updateCanvasBounds();

  els.graphNodes.innerHTML = "";
  state.nodeElements.clear();
  state.nodePorts.clear();

  for (const node of state.graph.nodes) {
    const pos = state.layout.nodes[node.id];
    const nodeEl = document.createElement("div");
    nodeEl.className = "node";
    nodeEl.dataset.nodeId = node.id;
    if (node.type) nodeEl.classList.add(`node-${String(node.type).toLowerCase()}`);
    nodeEl.style.left = `${pos.x + state.canvasOffset.x}px`;
    nodeEl.style.top = `${pos.y + state.canvasOffset.y}px`;

    const title = document.createElement("div");
    title.className = "node-title";
    title.textContent = `${node.type ?? "Unknown"} · ${node.id}`;
    const meta = document.createElement("div");
    meta.className = "node-meta";
    meta.textContent = summarizeNode(node);
    nodeEl.appendChild(title);
    nodeEl.appendChild(meta);
    if (node.type === "Choice") {
      const list = document.createElement("div");
      list.className = "choice-list";
      nodeEl.appendChild(list);
    }

    const ports = buildPortLayout(node);
    for (const port of ports.inputs) {
      const portEl = document.createElement("div");
      portEl.className = "port port-in";
      portEl.dataset.portId = port.id;
      if (port.edgeId) portEl.dataset.edgeId = port.edgeId;
      portEl.title = port.label || port.id;
      portEl.addEventListener("pointerup", (e) => onInputPortPointerUp(e, node.id, port.id));
      nodeEl.appendChild(portEl);
      port.el = portEl;
    }
    for (const port of ports.outputs) {
      const portEl = document.createElement("div");
      portEl.className = "port port-out";
      portEl.dataset.portId = port.id;
      if (port.edgeId) portEl.dataset.edgeId = port.edgeId;
      portEl.title = port.label || port.id;
      if (port.label) {
        const label = document.createElement("span");
        label.className = "port-label";
        label.textContent = port.label;
        portEl.appendChild(label);
      }
      portEl.addEventListener("pointerdown", (e) => onOutputPortPointerDown(e, node.id, port));
      nodeEl.appendChild(portEl);
      port.el = portEl;
    }

    nodeEl.addEventListener("pointerdown", (e) => onNodePointerDown(e, node.id));
    nodeEl.addEventListener("click", () => selectNode(node.id));

    if (state.selectedNodeId === node.id) nodeEl.classList.add("selected");

    els.graphNodes.appendChild(nodeEl);
    state.nodeElements.set(node.id, nodeEl);
    layoutPorts(nodeEl, ports);
    state.nodePorts.set(node.id, ports);
    if (node.type === "Choice") {
      updateChoiceInlineList(node.id);
    }
  }

  renderEdges();
  applyTransform();
}

function renderEdges() {
  if (!state.graph) return;
  const paths = [];
  const selectedId = state.selectedNodeId;

  for (const edge of state.graph.edges ?? []) {
    const fromId = edge?.from?.nodeId;
    const toId = edge?.to?.nodeId;
    const fromPos = state.layout.nodes?.[fromId];
    const toPos = state.layout.nodes?.[toId];
    if (!fromPos || !toPos) continue;

    const fromPorts = state.nodePorts.get(fromId);
    const toPorts = state.nodePorts.get(toId);
    if (!fromPorts || !toPorts) continue;

    const fromPort = resolveOutputPort(fromPorts, edge);
    const toPort = resolveInputPort(toPorts, edge);
    if (!fromPort || !toPort) continue;

    const x1 = fromPos.x + state.canvasOffset.x + (fromPort.offsetX ?? 0);
    const y1 = fromPos.y + state.canvasOffset.y + (fromPort.offsetY ?? 0);
    const x2 = toPos.x + state.canvasOffset.x + (toPort.offsetX ?? 0);
    const y2 = toPos.y + state.canvasOffset.y + (toPort.offsetY ?? 0);

    const dx = Math.max(60, Math.abs(x2 - x1) * 0.4);
    const c1x = x1 + (x2 >= x1 ? dx : -dx);
    const c2x = x2 - (x2 >= x1 ? dx : -dx);
    const path = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
    const isFocus = selectedId && (edge.from.nodeId === selectedId || edge.to.nodeId === selectedId);
    const color = isFocus ? "rgba(122,162,247,0.9)" : "rgba(255,255,255,0.12)";
    const width = isFocus ? 2.2 : 1.2;
    paths.push(`<path d="${path}" stroke="${color}" stroke-width="${width}" fill="none" marker-end="url(#arrow)" />`);
  }

  if (state.connecting && state.connecting.to) {
    const { fromNodeId, fromPortId, to } = state.connecting;
    const fromPos = state.layout.nodes?.[fromNodeId];
    const fromPorts = state.nodePorts.get(fromNodeId);
    const fromPort = fromPorts ? fromPorts.outputs.find((p) => p.id === fromPortId) ?? fromPorts.outputs[0] : null;
    if (fromPos && fromPort) {
      const x1 = fromPos.x + state.canvasOffset.x + (fromPort.offsetX ?? 0);
      const y1 = fromPos.y + state.canvasOffset.y + (fromPort.offsetY ?? 0);
      const x2 = to.x + state.canvasOffset.x;
      const y2 = to.y + state.canvasOffset.y;
      const dx = Math.max(60, Math.abs(x2 - x1) * 0.4);
      const c1x = x1 + (x2 >= x1 ? dx : -dx);
      const c2x = x2 - (x2 >= x1 ? dx : -dx);
      const path = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
      paths.push(`<path d="${path}" stroke="rgba(122,162,247,0.7)" stroke-width="2" fill="none" marker-end="url(#arrow)" />`);
    }
  }

  const defs = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.6)"></path>
    </marker>
  </defs>`;
  els.graphEdges.innerHTML = defs + paths.join("");
}

let dragState = null;
let panState = null;

function onNodePointerDown(event, nodeId) {
  const nodeEl = state.nodeElements.get(nodeId);
  if (!nodeEl) return;
  const pointer = screenToGraph(event.clientX, event.clientY);
  const pos = state.layout.nodes[nodeId];
  dragState = {
    nodeId,
    offsetX: pointer.x - pos.x,
    offsetY: pointer.y - pos.y,
    moved: false
  };
  selectNode(nodeId);
  nodeEl.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event) {
  if (dragState) {
    const pointer = screenToGraph(event.clientX, event.clientY);
    const x = pointer.x - dragState.offsetX;
    const y = pointer.y - dragState.offsetY;
    setLayoutNode(dragState.nodeId, { x, y });
    const nodeEl = state.nodeElements.get(dragState.nodeId);
    if (nodeEl) {
      nodeEl.style.left = `${x + state.canvasOffset.x}px`;
      nodeEl.style.top = `${y + state.canvasOffset.y}px`;
    }
    dragState.moved = true;
    state.autoFit = false;
    renderEdges();
    return;
  }
  if (state.connecting) {
    const pointer = screenToGraph(event.clientX, event.clientY);
    state.connecting.to = pointer;
    renderEdges();
  }
}

function onPointerUp() {
  if (dragState) {
    const moved = dragState.moved;
    dragState = null;
    if (moved) {
      updateCanvasBounds();
      renderGraph();
      if (state.selectedNodeId) selectNode(state.selectedNodeId);
    }
  }
  if (panState) {
    panState = null;
  }
  if (state.connecting) {
    state.connecting = null;
    renderEdges();
  }
}

document.addEventListener("pointermove", onPointerMove);
document.addEventListener("pointerup", onPointerUp);

function screenToGraph(clientX, clientY) {
  const rect = els.graphViewport.getBoundingClientRect();
  const { x, y, zoom } = state.viewport;
  return {
    x: (clientX - rect.left - x) / zoom - state.canvasOffset.x,
    y: (clientY - rect.top - y) / zoom - state.canvasOffset.y
  };
}

function onViewportPointerDown(event) {
  if (event.button !== 0) return;
  if (
    event.target !== els.graphViewport &&
    event.target !== els.graphCanvas &&
    event.target !== els.graphEdges &&
    event.target !== els.graphNodes
  )
    return;
  if (state.connecting) return;
  panState = {
    startX: event.clientX,
    startY: event.clientY,
    originX: state.viewport.x,
    originY: state.viewport.y
  };
}

function onViewportPointerMove(event) {
  if (!panState) return;
  const dx = event.clientX - panState.startX;
  const dy = event.clientY - panState.startY;
  state.viewport.x = panState.originX + dx;
  state.viewport.y = panState.originY + dy;
  state.layout.viewport = { ...state.viewport };
  state.dirtyLayout = true;
  state.autoFit = false;
  applyTransform();
}

function onViewportWheel(event) {
  if (isEditableTarget(document.activeElement)) return;
  event.preventDefault();
  const deltaX = Number(event.deltaX ?? 0);
  const deltaY = Number(event.deltaY ?? 0);
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    state.viewport.x -= deltaX;
    state.layout.viewport = { ...state.viewport };
    state.dirtyLayout = true;
    state.autoFit = false;
    applyTransform();
    return;
  }
  if (deltaY === 0) return;
  const rect = els.graphViewport.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;
  const prevZoom = state.viewport.zoom;
  const delta = deltaY > 0 ? 0.9 : 1.1;
  const nextZoom = Math.max(0.2, Math.min(3, prevZoom * delta));
  if (nextZoom === prevZoom) return;
  const offsetX = state.viewport.x;
  const offsetY = state.viewport.y;
  const newOffsetX = cursorX - ((cursorX - offsetX) / prevZoom) * nextZoom;
  const newOffsetY = cursorY - ((cursorY - offsetY) / prevZoom) * nextZoom;
  state.viewport = { x: newOffsetX, y: newOffsetY, zoom: nextZoom };
  state.layout.viewport = { ...state.viewport };
  state.dirtyLayout = true;
  state.autoFit = false;
  applyTransform();
}

function getViewportCenterGraph() {
  const rect = els.graphViewport.getBoundingClientRect();
  return screenToGraph(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

function onViewportDoubleClick(event) {
  if (!state.graph) return;
  if (event.target.closest && event.target.closest(".node")) return;
  const type = els.nodeTypeSelect?.value || "Dialogue";
  const pos = screenToGraph(event.clientX, event.clientY);
  addNodeAt(type, pos);
}

function onOutputPortPointerDown(event, nodeId, port) {
  event.stopPropagation();
  event.preventDefault();
  const pointer = screenToGraph(event.clientX, event.clientY);
  state.connecting = {
    fromNodeId: nodeId,
    fromPortId: port.id,
    fromEdgeId: port.edgeId ?? null,
    to: pointer
  };
  renderEdges();
}

function onInputPortPointerUp(event, nodeId, portId) {
  if (!state.connecting) return;
  event.stopPropagation();
  event.preventDefault();
  const { fromNodeId, fromPortId, fromEdgeId } = state.connecting;
  connectEdge({ fromNodeId, fromPortId, fromEdgeId, toNodeId: nodeId, toPortId: portId });
  state.connecting = null;
  refreshPortLayout();
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  for (const [id, el] of state.nodeElements.entries()) {
    if (id === nodeId) el.classList.add("selected");
    else el.classList.remove("selected");
  }
  renderEdges();
  renderInspector(nodeId);
  updateScenePreview();
}

function renderInspector(nodeId) {
  els.inspector.innerHTML = "";
  if (!nodeId) {
    els.inspector.innerHTML = "<div class=\"muted\">选择一个节点以编辑</div>";
    if (els.rightPanel) els.rightPanel.classList.remove("open");
    return;
  }
  if (els.rightPanel) els.rightPanel.classList.add("open");
  const node = getNodeById(nodeId);
  if (!node) return;
  if (!node.data) node.data = {};

  const schema = NODE_SCHEMA[node.type] ?? { label: node.type ?? "节点", fields: [] };

  const header = document.createElement("div");
  header.className = "inspector-group";
  header.innerHTML = `<div class="inspector-label">节点</div><div>${escapeHtml(schema.label)} · ${escapeHtml(node.id)}</div>`;
  els.inspector.appendChild(header);

  const actions = document.createElement("div");
  actions.className = "inspector-group";
  const copyBtn = document.createElement("button");
  copyBtn.textContent = "复制节点";
  copyBtn.addEventListener("click", () => duplicateNode(node.id));
  const delBtn = document.createElement("button");
  delBtn.textContent = "删除节点";
  delBtn.addEventListener("click", () => deleteNode(node.id));
  actions.appendChild(copyBtn);
  actions.appendChild(delBtn);
  els.inspector.appendChild(actions);

  for (const field of schema.fields) {
    els.inspector.appendChild(createField(node, field));
  }

  if (node.type === "SetVariable") {
    els.inspector.appendChild(createVariableSection(node));
  }

  if (node.type === "Branch") {
    els.inspector.appendChild(createBranchSection(node));
  }

  if (node.type === "Choice") {
    els.inspector.appendChild(createChoiceSection(node));
  }

  if (!["End", "Choice", "Branch", "SwitchScene"].includes(node.type)) {
    els.inspector.appendChild(createNextSection(node));
  }

  els.inspector.appendChild(createLayoutSection(nodeId));
}

function createGroup(labelText) {
  const group = document.createElement("div");
  group.className = "inspector-group";
  if (labelText) {
    const label = document.createElement("div");
    label.className = "inspector-label";
    label.textContent = labelText;
    group.appendChild(label);
  }
  return group;
}

function createField(node, field) {
  const group = createGroup(field.label);
  const value = getByPath(node.data, field.key);

  if (field.type === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.className = "inspector-textarea";
    textarea.value = value ?? "";
    textarea.addEventListener("input", () => {
      setByPath(node.data, field.key, textarea.value);
      state.dirtyGraph = true;
      updateNodeSummary(node.id);
    });
    group.appendChild(textarea);
    return group;
  }

  if (field.type === "select") {
    const select = document.createElement("select");
    select.className = "inspector-select";
    const options = Array.isArray(field.options)
      ? field.options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
      : [];
    for (const opt of options) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label ?? opt.value;
      select.appendChild(option);
    }
    select.value = value ?? options[0]?.value ?? "";
    select.addEventListener("change", () => {
      setByPath(node.data, field.key, select.value);
      state.dirtyGraph = true;
      updateNodeSummary(node.id);
    });
    group.appendChild(select);
    return group;
  }

  if (field.type === "scene-select") {
    const select = document.createElement("select");
    select.className = "inspector-select";
    const scenes = Array.isArray(state.project?.scenes) ? state.project.scenes : [];
    for (const scene of scenes) {
      const option = document.createElement("option");
      option.value = scene.id ?? "";
      option.textContent = scene.id ?? "";
      select.appendChild(option);
    }
    select.value = value ?? scenes[0]?.id ?? "";
    select.addEventListener("change", () => {
      setByPath(node.data, field.key, select.value);
      state.dirtyGraph = true;
      updateNodeSummary(node.id);
    });
    group.appendChild(select);
    return group;
  }

  if (field.type === "boolean") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(value);
    input.addEventListener("change", () => {
      setByPath(node.data, field.key, input.checked);
      state.dirtyGraph = true;
    });
    group.appendChild(input);
    return group;
  }

  if (field.type === "label-select") {
    const select = document.createElement("select");
    select.className = "inspector-select";
    const labels = state.graph.nodes.filter((n) => n.type === "Label").map((n) => n.data?.name).filter(Boolean);
    for (const name of labels) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    }
    select.value = value ?? "";
    select.addEventListener("change", () => {
      setByPath(node.data, field.key, select.value);
      state.dirtyGraph = true;
      updateNodeSummary(node.id);
    });
    group.appendChild(select);
    return group;
  }

  const input = document.createElement("input");
  input.className = "inspector-input";
  input.type = field.type === "number" ? "number" : "text";
  input.value = value ?? "";
  input.addEventListener("input", () => {
    const v = field.type === "number" ? Number(input.value) : input.value;
    setByPath(node.data, field.key, Number.isNaN(v) ? 0 : v);
    state.dirtyGraph = true;
    updateNodeSummary(node.id);
  });
  group.appendChild(input);
  return group;
}

function createVariableSection(node) {
  const group = createGroup("变量设置");
  const names = Object.keys(state.variables ?? {});
  const varSelect = document.createElement("select");
  varSelect.className = "inspector-select";
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    varSelect.appendChild(option);
  }
  varSelect.value = node.data?.name ?? "";
  varSelect.addEventListener("change", () => {
    node.data.name = varSelect.value;
    node.data.value = getDefaultValueForVariable(varSelect.value);
    state.dirtyGraph = true;
    renderInspector(node.id);
  });

  const opSelect = document.createElement("select");
  opSelect.className = "inspector-select";
  ["set", "add"].forEach((op) => {
    const option = document.createElement("option");
    option.value = op;
    option.textContent = op;
    opSelect.appendChild(option);
  });
  opSelect.value = node.data?.op ?? "set";
  opSelect.addEventListener("change", () => {
    node.data.op = opSelect.value;
    state.dirtyGraph = true;
  });

  const valueField = createVariableValueField(node.data?.name, node.data?.value, (val) => {
    node.data.value = val;
    state.dirtyGraph = true;
  });

  group.appendChild(varSelect);
  group.appendChild(opSelect);
  group.appendChild(valueField);
  return group;
}

function getDefaultValueForVariable(name) {
  const def = state.variables?.[name];
  if (!def) return "";
  if (def.type === "flag") return false;
  if (def.type === "number") return 0;
  if (def.type === "enum") return def.enumValues?.[0] ?? "";
  return "";
}

function createVariableValueField(name, value, onChange) {
  const def = state.variables?.[name];
  if (def?.type === "flag") {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(value);
    input.addEventListener("change", () => onChange(input.checked));
    return input;
  }
  if (def?.type === "enum") {
    const select = document.createElement("select");
    select.className = "inspector-select";
    const values = Array.isArray(def.enumValues) ? def.enumValues : [];
    for (const v of values) {
      const option = document.createElement("option");
      option.value = v;
      option.textContent = v;
      select.appendChild(option);
    }
    select.value = value ?? values[0] ?? "";
    select.addEventListener("change", () => onChange(select.value));
    return select;
  }
  const input = document.createElement("input");
  input.className = "inspector-input";
  input.type = def?.type === "number" ? "number" : "text";
  input.value = value ?? "";
  input.addEventListener("input", () => onChange(def?.type === "number" ? Number(input.value) : input.value));
  return input;
}

function createBranchSection(node) {
  const group = createGroup("条件分支");
  if (!node.data) node.data = {};
  if (!node.data.cond) node.data.cond = { op: "truthy", var: "" };

  const cond = node.data.cond;
  if (cond.op === "and" || cond.op === "or" || Array.isArray(cond.items)) {
    const textarea = document.createElement("textarea");
    textarea.className = "inspector-textarea";
    textarea.value = JSON.stringify(cond, null, 2);
    textarea.addEventListener("change", () => {
      try {
        node.data.cond = JSON.parse(textarea.value);
        state.dirtyGraph = true;
      } catch {
        setStatus("条件 JSON 格式错误", "error");
      }
    });
    group.appendChild(textarea);
    return group;
  }

  const opSelect = document.createElement("select");
  opSelect.className = "inspector-select";
  ["truthy", "falsy", "eq", "neq", "gt", "gte", "lt", "lte"].forEach((op) => {
    const option = document.createElement("option");
    option.value = op;
    option.textContent = op;
    opSelect.appendChild(option);
  });
  opSelect.value = cond.op ?? "truthy";
  opSelect.addEventListener("change", () => {
    node.data.cond.op = opSelect.value;
    if (["truthy", "falsy"].includes(opSelect.value)) {
      delete node.data.cond.value;
    } else if (!("value" in node.data.cond)) {
      node.data.cond.value = "";
    }
    state.dirtyGraph = true;
    renderInspector(node.id);
  });

  const varInput = document.createElement("input");
  varInput.className = "inspector-input";
  varInput.value = cond.var ?? "";
  varInput.placeholder = "变量名";
  varInput.addEventListener("input", () => {
    node.data.cond.var = varInput.value;
    state.dirtyGraph = true;
  });

  group.appendChild(opSelect);
  group.appendChild(varInput);

  if (!["truthy", "falsy"].includes(cond.op)) {
    const valueField = createVariableValueField(cond.var, cond.value, (val) => {
    node.data.cond.value = val;
    state.dirtyGraph = true;
  });
    group.appendChild(valueField);
  }

  const edgesGroup = createGroup("分支目标");
  const edges = getOutgoingEdges(node.id);
  const thenEdge = edges.find((e) => e.from?.portId === "then") ?? null;
  const elseEdge = edges.find((e) => e.from?.portId === "else") ?? null;
  edgesGroup.appendChild(createBranchTargetRow("then", node.id, "then", thenEdge));
  edgesGroup.appendChild(createBranchTargetRow("else", node.id, "else", elseEdge));
  group.appendChild(edgesGroup);

  return group;
}

function createChoiceSection(node) {
  const group = createGroup("选项");
  for (const edge of getOutgoingEdges(node.id)) {
    group.appendChild(createChoiceRow(edge));
  }

  const btn = document.createElement("button");
  btn.className = "secondary";
  btn.textContent = "新增选项";
  btn.addEventListener("click", () => {
    addChoiceEdge(node.id);
    renderInspector(node.id);
  });
  group.appendChild(btn);
  return group;
}

function createChoiceRow(edge) {
  const row = document.createElement("div");
  row.className = "edge-row";
  const input = document.createElement("input");
  input.className = "inspector-input";
  input.value = edge.data?.text ?? "";
  input.placeholder = "选项文本";
  input.addEventListener("input", () => {
    if (!edge.data) edge.data = {};
    edge.data.text = input.value;
    state.dirtyGraph = true;
    updateChoicePortLabels(edge.from.nodeId);
  });
  const select = createTargetSelect(edge.to.nodeId, (value) => {
    if (!value) {
      state.graph.edges = (state.graph.edges ?? []).filter((e) => e !== edge);
      state.dirtyGraph = true;
      refreshPortLayout();
      return;
    }
    edge.to.nodeId = value;
    state.dirtyGraph = true;
    renderEdges();
  }, true);
  row.appendChild(input);
  row.appendChild(select);
  return row;
}

function createNextSection(node) {
  const group = createGroup("下一节点");
  const edge = getOutgoingEdges(node.id)[0] ?? null;
  const select = createTargetSelect(edge?.to?.nodeId ?? "", (value) => {
    setSingleEdgeTarget(node.id, value);
  }, true);
  group.appendChild(select);
  return group;
}

function createLayoutSection(nodeId) {
  const group = createGroup("布局");
  const pos = getLayoutNode(nodeId);
  const inputX = document.createElement("input");
  inputX.className = "inspector-input";
  inputX.type = "number";
  inputX.value = pos?.x ?? 0;
  inputX.addEventListener("input", () => {
    const current = getLayoutNode(nodeId) ?? { x: 0, y: 0 };
    const x = Number(inputX.value) || 0;
    setLayoutNode(nodeId, { x, y: current?.y ?? 0 });
    const nodeEl = state.nodeElements.get(nodeId);
    if (nodeEl) nodeEl.style.left = `${x + state.canvasOffset.x}px`;
    renderEdges();
  });

  const inputY = document.createElement("input");
  inputY.className = "inspector-input";
  inputY.type = "number";
  inputY.value = pos?.y ?? 0;
  inputY.addEventListener("input", () => {
    const current = getLayoutNode(nodeId) ?? { x: 0, y: 0 };
    const y = Number(inputY.value) || 0;
    setLayoutNode(nodeId, { x: current?.x ?? 0, y });
    const nodeEl = state.nodeElements.get(nodeId);
    if (nodeEl) nodeEl.style.top = `${y + state.canvasOffset.y}px`;
    renderEdges();
  });

  group.appendChild(inputX);
  group.appendChild(inputY);
  return group;
}

function createBranchTargetRow(label, nodeId, portId, edge) {
  const row = document.createElement("div");
  row.className = "edge-row";
  const tag = document.createElement("small");
  tag.textContent = label;
  const select = createTargetSelect(edge?.to?.nodeId ?? "", (value) => {
    setBranchEdgeTarget(nodeId, portId, value);
  }, true);
  row.appendChild(tag);
  row.appendChild(select);
  return row;
}

function createTargetSelect(currentValue, onChange, allowEmpty = false) {
  const select = document.createElement("select");
  select.className = "inspector-select";
  if (allowEmpty) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "未连接";
    select.appendChild(option);
  }
  for (const node of state.graph.nodes) {
    const option = document.createElement("option");
    option.value = node.id;
    option.textContent = `${node.type ?? "Node"} · ${node.id}`;
    select.appendChild(option);
  }
  select.value = currentValue ?? "";
  select.addEventListener("change", () => onChange(select.value));
  select.addEventListener("change", () => refreshPortLayout());
  return select;
}

function getOutgoingEdges(nodeId) {
  return (state.graph.edges ?? []).filter((e) => e?.from?.nodeId === nodeId);
}

function getIncomingEdges(nodeId) {
  return (state.graph.edges ?? []).filter((e) => e?.to?.nodeId === nodeId);
}

function resolveOutputPort(ports, edge) {
  const portId = edge?.from?.portId;
  if (portId) {
    const hit = ports.outputs.find((p) => p.id === portId);
    if (hit) return hit;
  }
  if (edge?.id) {
    const byEdge = ports.outputs.find((p) => p.edgeId === edge.id);
    if (byEdge) return byEdge;
  }
  return ports.outputs[0] ?? null;
}

function resolveInputPort(ports, edge) {
  const portId = edge?.to?.portId;
  if (ports.inputs.length > 1 && edge?.id) {
    const byEdge = ports.inputs.find((p) => p.edgeId === edge.id);
    if (byEdge) return byEdge;
  }
  if (portId) {
    const hit = ports.inputs.find((p) => p.id === portId);
    if (hit) return hit;
  }
  if (edge?.id) {
    const byEdge = ports.inputs.find((p) => p.edgeId === edge.id);
    if (byEdge) return byEdge;
  }
  return ports.inputs[0] ?? null;
}

function setSingleEdgeTarget(nodeId, targetId) {
  if (!state.graph) return;
  const edges = getOutgoingEdges(nodeId);
  const edge = edges[0] ?? null;
  if (!targetId) {
    if (edge) {
      state.graph.edges = state.graph.edges.filter((e) => e !== edge);
      state.dirtyGraph = true;
      refreshPortLayout();
    }
    return;
  }
  if (!edge) {
    const newEdge = {
      id: `e_${nodeId}_out_${Date.now()}`,
      from: { nodeId, portId: "out" },
      to: { nodeId: targetId, portId: "in" }
    };
    state.graph.edges.push(newEdge);
  } else {
    edge.to.nodeId = targetId;
  }
  state.dirtyGraph = true;
  refreshPortLayout();
}

function setBranchEdgeTarget(nodeId, portId, targetId) {
  if (!state.graph) return;
  const edges = getOutgoingEdges(nodeId);
  const edge = edges.find((e) => e.from?.portId === portId) ?? null;
  if (!targetId) {
    if (edge) {
      state.graph.edges = state.graph.edges.filter((e) => e !== edge);
      state.dirtyGraph = true;
      refreshPortLayout();
    }
    return;
  }
  if (!edge) {
    const newEdge = {
      id: `e_${nodeId}_${portId}_${Date.now()}`,
      from: { nodeId, portId },
      to: { nodeId: targetId, portId: "in" }
    };
    state.graph.edges.push(newEdge);
  } else {
    edge.to.nodeId = targetId;
  }
  state.dirtyGraph = true;
  refreshPortLayout();
}

function connectEdge({ fromNodeId, fromPortId, fromEdgeId, toNodeId, toPortId }) {
  if (!state.graph) return;
  const fromNode = getNodeById(fromNodeId);
  if (!fromNode) return;
  const type = fromNode.type ?? "Unknown";
  let edge = null;

  if (type === "Branch") {
    edge = state.graph.edges.find((e) => e.from?.nodeId === fromNodeId && e.from?.portId === fromPortId) ?? null;
    if (!edge) {
      edge = {
        id: `e_${fromNodeId}_${fromPortId}_${Date.now()}`,
        from: { nodeId: fromNodeId, portId: fromPortId },
        to: { nodeId: toNodeId, portId: toPortId }
      };
      state.graph.edges.push(edge);
    }
  } else if (type === "Choice") {
    if (fromEdgeId) {
      edge = state.graph.edges.find((e) => e.id === fromEdgeId) ?? null;
    }
    if (!edge) {
      edge = state.graph.edges.find((e) => e.from?.nodeId === fromNodeId && e.from?.portId === fromPortId) ?? null;
    }
    if (!edge) {
      const label = state.nodePorts.get(fromNodeId)?.outputs.find((p) => p.id === fromPortId)?.label ?? "选项";
      edge = {
        id: `e_${fromNodeId}_choice_${Date.now()}`,
        from: { nodeId: fromNodeId, portId: fromPortId },
        to: { nodeId: toNodeId, portId: toPortId },
        data: { text: label }
      };
      state.graph.edges.push(edge);
    }
  } else {
    const outgoing = getOutgoingEdges(fromNodeId);
    edge = outgoing[0] ?? null;
    if (!edge) {
      edge = {
        id: `e_${fromNodeId}_out_${Date.now()}`,
        from: { nodeId: fromNodeId, portId: fromPortId || "out" },
        to: { nodeId: toNodeId, portId: toPortId }
      };
      state.graph.edges.push(edge);
    } else {
      // 单出口节点：保持只有一条边
      state.graph.edges = state.graph.edges.filter((e) => e === edge || e.from?.nodeId !== fromNodeId);
    }
  }

  edge.from.nodeId = fromNodeId;
  edge.from.portId = fromPortId || edge.from.portId || "out";
  edge.to.nodeId = toNodeId;
  edge.to.portId = toPortId || edge.to.portId || "in";

  state.dirtyGraph = true;
  updateScenePreview();
}

function ensureSingleEdge(nodeId) {
  const edges = getOutgoingEdges(nodeId);
  if (edges.length > 0) return edges[0];
  const target = pickDefaultTarget(nodeId);
  const edge = {
    id: `e_${nodeId}_${target}_${Date.now()}`,
    from: { nodeId, portId: "out" },
    to: { nodeId: target, portId: "in" }
  };
  state.graph.edges.push(edge);
  state.dirtyGraph = true;
  const selected = state.selectedNodeId;
  renderGraph();
  if (selected) selectNode(selected);
  return edge;
}

function ensureBranchEdge(nodeId, portId) {
  const edges = getOutgoingEdges(nodeId);
  const existing = edges.find((e) => e.from?.portId === portId);
  if (existing) return existing;
  const target = pickDefaultTarget(nodeId);
  const edge = {
    id: `e_${nodeId}_${portId}_${Date.now()}`,
    from: { nodeId, portId },
    to: { nodeId: target, portId: "in" }
  };
  state.graph.edges.push(edge);
  state.dirtyGraph = true;
  renderEdges();
  return edge;
}

function addChoiceEdge(nodeId) {
  const target = pickDefaultTarget(nodeId);
  const index = getOutgoingEdges(nodeId).length + 1;
  const edge = {
    id: `e_${nodeId}_choice_${Date.now()}`,
    from: { nodeId, portId: "out" },
    to: { nodeId: target, portId: "in" },
    data: { text: `选项${index}` }
  };
  state.graph.edges.push(edge);
  state.dirtyGraph = true;
  refreshPortLayout();
  return edge;
}

function pickDefaultTarget(nodeId) {
  const nodes = state.graph.nodes.filter((n) => n.id !== nodeId);
  return nodes[0]?.id ?? nodeId;
}

function updateNodeSummary(nodeId) {
  const nodeEl = state.nodeElements.get(nodeId);
  const node = getNodeById(nodeId);
  if (!nodeEl || !node) return;
  const meta = nodeEl.querySelector(".node-meta");
  if (meta) meta.textContent = summarizeNode(node);
  const ports = state.nodePorts.get(nodeId);
  if (ports) layoutPorts(nodeEl, ports);
  renderEdges();
  updateScenePreview();
}

function renderScenePreview(nodeId) {
  const preview = els.scenePreview;
  const info = els.scenePreviewInfo;
  if (!preview || !state.graph) return;

  const entryId = getEntryNodeId();
  const targetId = nodeId ?? entryId;
  const path = findPath(entryId, targetId);
  const appliedPath = path ?? (entryId ? [entryId] : []);
  const note = path
    ? `入口 → ${targetId}（${appliedPath.length} 节点）`
    : "未找到到达所选节点的路径，使用入口状态";

  const previewState = computeScenePreviewState(appliedPath);

  const width = Number(state.project?.resolution?.width ?? 1280);
  const height = Number(state.project?.resolution?.height ?? 720);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    preview.style.aspectRatio = `${width} / ${height}`;
  } else {
    preview.style.aspectRatio = "16 / 9";
  }

  preview.innerHTML = "";
  if (previewState.background) {
    const bgUrl = resolveAssetUrl(previewState.background);
    preview.style.backgroundImage = bgUrl ? `url(${bgUrl})` : "none";
  } else {
    preview.style.backgroundImage = "none";
  }

  const charsLayer = document.createElement("div");
  charsLayer.className = "scene-preview-chars";
  for (const char of previewState.characters) {
    const charEl = document.createElement("div");
    charEl.className = "scene-preview-char";
    const x = clamp01(char.position?.x ?? 0.5);
    const y = clamp01(char.position?.y ?? 0);
    const scale = Number.isFinite(char.scale) ? char.scale : 1;

    if (char.renderer === "live2d") {
      const badge = document.createElement("div");
      badge.className = "scene-preview-live2d";
      badge.textContent = `${char.characterId ?? "Live2D"}`;
      badge.style.left = `${Math.round(x * 100)}%`;
      badge.style.bottom = `${Math.round(y * 100)}%`;
      badge.style.transform = `translateX(-50%) scale(${scale})`;
      charEl.appendChild(badge);
    } else if (char.appearance) {
      const img = document.createElement("img");
      img.alt = char.characterId ?? "";
      img.src = resolveAssetUrl(char.appearance);
      img.style.left = `${Math.round(x * 100)}%`;
      img.style.bottom = `${Math.round(y * 100)}%`;
      img.style.transform = `translateX(-50%) scale(${scale})`;
      charEl.appendChild(img);
    }
    if (charEl.childElementCount > 0) charsLayer.appendChild(charEl);
  }
  preview.appendChild(charsLayer);

  if (!previewState.background && previewState.characters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "scene-preview-empty";
    empty.textContent = "该路径未设置背景或立绘";
    preview.appendChild(empty);
  }

  if (info) info.textContent = note;
}

function updateScenePreview() {
  if (!els.scenePreview || !state.graph) return;
  const nodeId = state.selectedNodeId ?? getEntryNodeId();
  renderScenePreview(nodeId);
}

function resolveAssetUrl(assetPath) {
  if (!assetPath) return "";
  if (assetPath.startsWith("data:")) return assetPath;
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  if (assetPath.startsWith("file://")) return assetPath;
  if (assetPath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(assetPath)) {
    return toFileUrl(assetPath);
  }
  if (!state.projectDir || !api) return assetPath;
  const abs = api.pathJoin(state.projectDir, assetPath);
  return toFileUrl(abs);
}

function toFileUrl(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";
  return encodeURI(prefix + normalized);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function findPath(entryId, targetId) {
  if (!entryId) return null;
  if (!targetId || entryId === targetId) return [entryId];
  const queue = [entryId];
  const visited = new Set([entryId]);
  const prev = new Map();
  while (queue.length > 0) {
    const current = queue.shift();
    const nexts = getNextNodeIds(current);
    for (const next of nexts) {
      if (!next || visited.has(next)) continue;
      visited.add(next);
      prev.set(next, current);
      if (next === targetId) {
        const path = [next];
        let p = current;
        while (p) {
          path.push(p);
          p = prev.get(p);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

function getNextNodeIds(nodeId) {
  const node = getNodeById(nodeId);
  if (!node) return [];
  const type = node.type ?? "Unknown";
  if (type === "SwitchScene") return [];
  if (type === "Jump") {
    const labelName = node.data?.targetLabel;
    const labelNode = state.graph.nodes.find((n) => n.type === "Label" && n.data?.name === labelName);
    if (labelNode?.id) return [labelNode.id];
  }
  const edges = getOutgoingEdges(nodeId);
  const ordered = edges.slice();
  if (type === "Branch") {
    const order = { then: 0, else: 1 };
    ordered.sort((a, b) => {
      const ai = order[a?.from?.portId] ?? 9;
      const bi = order[b?.from?.portId] ?? 9;
      if (ai !== bi) return ai - bi;
      return String(a.id).localeCompare(String(b.id));
    });
  } else if (type === "Choice") {
    const getIndex = (portId) => {
      if (portId === "out") return 0;
      if (typeof portId === "string" && portId.startsWith("out-")) {
        const idx = Number(portId.split("-")[1]);
        return Number.isFinite(idx) ? idx : 999;
      }
      return 999;
    };
    ordered.sort((a, b) => {
      const ai = getIndex(a?.from?.portId);
      const bi = getIndex(b?.from?.portId);
      if (ai !== bi) return ai - bi;
      return String(a.id).localeCompare(String(b.id));
    });
  } else {
    ordered.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }
  return ordered.map((e) => e?.to?.nodeId).filter(Boolean);
}

function computeScenePreviewState(path) {
  const background = { value: "" };
  const characters = new Map();
  for (const nodeId of path) {
    const node = getNodeById(nodeId);
    if (!node) continue;
    if (node.type === "Background") {
      background.value = node.data?.background ?? "";
      continue;
    }
    if (node.type === "Character") {
      const characterId = node.data?.characterId ?? "";
      if (!characterId) continue;
      const action = node.data?.action ?? "show";
      if (action === "hide") {
        characters.delete(characterId);
        continue;
      }
      characters.set(characterId, {
        characterId,
        renderer: node.data?.renderer ?? "static",
        appearance: node.data?.appearance ?? "",
        position: node.data?.position ?? { x: 0.5, y: 0 },
        scale: Number(node.data?.scale ?? 1)
      });
    }
  }
  return {
    background: background.value,
    characters: Array.from(characters.values())
  };
}

function updateChoicePortLabels(nodeId) {
  const ports = state.nodePorts.get(nodeId);
  if (!ports) return;
  const edges = getOutgoingEdges(nodeId);
  for (const port of ports.outputs) {
    const edge = port.edgeId ? edges.find((e) => e.id === port.edgeId) : null;
    const index = edge ? edges.indexOf(edge) + 1 : 1;
    const label = edge?.data?.text ?? `选项${index}`;
    port.label = label;
    if (port.el) {
      port.el.title = label;
      let span = port.el.querySelector(".port-label");
      if (!span) {
        span = document.createElement("span");
        span.className = "port-label";
        port.el.appendChild(span);
      }
      span.textContent = label;
    }
  }
  updateChoiceInlineList(nodeId);
}

async function openProject() {
  const dir = await api.selectProjectDir();
  if (!dir) return;
  await loadProject(dir);
}

async function loadProject(projectDir) {
  try {
    const projectPath = api.pathJoin(projectDir, "project.json");
    const project = await api.readJson(projectPath);
    const variablesPath = api.pathJoin(projectDir, "variables.json");
    let variables = {};
    try {
      variables = await api.readJson(variablesPath);
    } catch {
      variables = {};
    }
    state.projectDir = projectDir;
    state.project = project;
    state.variables = variables;
    els.projectPath.textContent = projectDir;
    els.outDir.value = api.pathJoin(projectDir, "build", "web");
    await renderScenes();
    renderVariables();
    clearDiagnostics();
    setStatus("项目已加载");
  } catch (e) {
    setStatus(`加载失败：${e?.message ?? e}`, "error");
  }
}

function getVariablesPath() {
  if (!state.projectDir || !api) return null;
  return api.pathJoin(state.projectDir, "variables.json");
}

function setVarFormByType(type) {
  if (!els.varDefaultInput) return;
  if (type === "flag") {
    els.varDefaultInput.hidden = true;
    if (els.varEnumDefaultSelect) els.varEnumDefaultSelect.hidden = true;
    if (els.varFlagDefaultSelect) els.varFlagDefaultSelect.hidden = false;
    if (els.varEnumEditor) els.varEnumEditor.hidden = true;
  } else if (type === "enum") {
    els.varDefaultInput.hidden = true;
    if (els.varEnumDefaultSelect) els.varEnumDefaultSelect.hidden = false;
    if (els.varFlagDefaultSelect) els.varFlagDefaultSelect.hidden = true;
    if (els.varEnumEditor) els.varEnumEditor.hidden = false;
  } else {
    els.varDefaultInput.hidden = false;
    if (els.varEnumDefaultSelect) els.varEnumDefaultSelect.hidden = true;
    if (els.varFlagDefaultSelect) els.varFlagDefaultSelect.hidden = true;
    if (els.varEnumEditor) els.varEnumEditor.hidden = true;
  }
}

function normalizeEnumValue(value) {
  return String(value ?? "").trim();
}

function renderEnumDraft() {
  if (!els.varEnumList) return;
  els.varEnumList.innerHTML = "";
  const values = Array.isArray(state.enumDraft) ? state.enumDraft : [];
  updateEnumDefaultSelect(values);
  if (values.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "暂无枚举值";
    els.varEnumList.appendChild(empty);
    return;
  }
  for (const value of values) {
    const row = document.createElement("div");
    row.className = "enum-row";
    const label = document.createElement("div");
    label.textContent = value;
    const del = document.createElement("button");
    del.className = "secondary";
    del.textContent = "删除";
    del.addEventListener("click", () => {
      state.enumDraft = values.filter((v) => v !== value);
      renderEnumDraft();
    });
    row.appendChild(label);
    row.appendChild(del);
    els.varEnumList.appendChild(row);
  }
}

function updateEnumDefaultSelect(values) {
  if (!els.varEnumDefaultSelect) return;
  const list = Array.isArray(values) ? values : [];
  const current = els.varEnumDefaultSelect.value;
  els.varEnumDefaultSelect.innerHTML = "";
  if (list.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "请先添加枚举值";
    els.varEnumDefaultSelect.appendChild(opt);
    els.varEnumDefaultSelect.disabled = true;
    return;
  }
  for (const value of list) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    els.varEnumDefaultSelect.appendChild(opt);
  }
  els.varEnumDefaultSelect.disabled = false;
  if (current && list.includes(current)) els.varEnumDefaultSelect.value = current;
  else els.varEnumDefaultSelect.value = list[0];
}

function addEnumValue() {
  const raw = normalizeEnumValue(els.varEnumValueInput?.value);
  if (!raw) {
    setStatus("请输入枚举值", "warn");
    return;
  }
  if (!Array.isArray(state.enumDraft)) state.enumDraft = [];
  if (state.enumDraft.includes(raw)) {
    setStatus(`枚举值已存在：${raw}`, "warn");
    return;
  }
  state.enumDraft = [...state.enumDraft, raw];
  if (els.varEnumValueInput) {
    els.varEnumValueInput.value = "";
    els.varEnumValueInput.focus();
  }
  renderEnumDraft();
}

function setFlagSelect(value) {
  if (!els.varFlagDefaultSelect) return;
  const normalized = value === true || value === "true" ? "true" : "false";
  els.varFlagDefaultSelect.value = normalized;
}

function getFlagSelectValue() {
  if (!els.varFlagDefaultSelect) return false;
  return String(els.varFlagDefaultSelect.value) === "true";
}

async function saveVariables() {
  const path = getVariablesPath();
  if (!path) return;
  await api.writeJson(path, state.variables ?? {});
}

function renderVariables() {
  if (!els.variablesList) return;
  els.variablesList.innerHTML = "";
  const vars = state.variables && typeof state.variables === "object" ? state.variables : {};
  const names = Object.keys(vars).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "暂无变量";
    els.variablesList.appendChild(empty);
    return;
  }
  for (const name of names) {
    const def = vars[name] ?? {};
    const row = document.createElement("div");
    row.className = "var-row";
    const label = document.createElement("div");
    const type = def.type ?? "unknown";
    const value = "default" in def ? def.default : "";
    label.innerHTML = `<div>${escapeHtml(name)}</div><div class="muted">${escapeHtml(type)} · ${escapeHtml(String(value))}</div>`;
    const del = document.createElement("button");
    del.className = "secondary";
    del.textContent = "删除";
    del.addEventListener("click", async () => {
      delete state.variables[name];
      await saveVariables();
      renderVariables();
      renderInspector(state.selectedNodeId);
      setStatus(`已删除变量：${name}`);
    });
    row.appendChild(label);
    row.appendChild(del);
    els.variablesList.appendChild(row);
  }
}

function resetVarForm() {
  if (els.varNameInput) els.varNameInput.value = "";
  if (els.varDefaultInput) els.varDefaultInput.value = "";
  setFlagSelect(false);
  state.enumDraft = [];
  if (els.varEnumValueInput) els.varEnumValueInput.value = "";
  renderEnumDraft();
  if (els.varTypeSelect) {
    if (!els.varTypeSelect.value) els.varTypeSelect.value = "flag";
    setVarFormByType(els.varTypeSelect.value);
  }
}

function openVarCreate() {
  if (!state.projectDir) {
    setStatus("未打开项目", "warn");
    return;
  }
  if (!els.varModal) return;
  resetVarForm();
  els.varModal.hidden = false;
  if (els.varNameInput) {
    els.varNameInput.focus();
    els.varNameInput.select();
  }
}

function closeVarCreate() {
  if (!els.varModal) return;
  els.varModal.hidden = true;
  resetVarForm();
}

async function confirmVarCreate() {
  if (!state.projectDir) {
    setStatus("未打开项目", "warn");
    return;
  }
  const name = String(els.varNameInput?.value ?? "").trim();
  if (!name) {
    setStatus("请输入变量名", "warn");
    return;
  }
  if (!/^[a-zA-Z0-9_\\-]+$/.test(name)) {
    setStatus("变量名仅允许字母/数字/下划线/短横线", "warn");
    return;
  }
  if (!state.variables || typeof state.variables !== "object") state.variables = {};
  if (state.variables[name]) {
    setStatus(`变量已存在：${name}`, "warn");
    return;
  }
  const type = els.varTypeSelect?.value ?? "flag";
  let def = { type };
  if (type === "flag") {
    def.default = getFlagSelectValue();
  } else if (type === "number") {
    const num = Number(els.varDefaultInput?.value ?? 0);
    def.default = Number.isFinite(num) ? num : 0;
  } else if (type === "enum") {
    const values = Array.isArray(state.enumDraft) ? state.enumDraft : [];
    if (values.length === 0) {
      setStatus("请添加枚举值", "warn");
      return;
    }
    def.enumValues = values;
    const selected = String(els.varEnumDefaultSelect?.value ?? "");
    def.default = values.includes(selected) ? selected : values[0] ?? "";
  }
  state.variables[name] = def;
  await saveVariables();
  renderVariables();
  renderInspector(state.selectedNodeId);
  closeVarCreate();
  setStatus(`已新增变量：${name}`);
}

async function renderScenes(selectedSceneId = null) {
  els.sceneList.innerHTML = "";
  if (!state.project || !Array.isArray(state.project.scenes)) return;
  for (const scene of state.project.scenes) {
    const btn = document.createElement("button");
    btn.textContent = `${scene.id ?? "scene"}  |  ${scene.graph ?? ""}`;
    btn.addEventListener("click", () => loadScene(scene));
    els.sceneList.appendChild(btn);
  }
  if (state.project.scenes.length > 0) {
    const target =
      state.project.scenes.find((s) => s.id === (selectedSceneId ?? state.currentScene?.id)) ?? state.project.scenes[0];
    await loadScene(target);
  }
}

function buildDefaultSceneId() {
  const scenes = Array.isArray(state.project?.scenes) ? state.project.scenes : [];
  const used = new Set(scenes.map((s) => s.id));
  for (let i = 1; i <= 999; i += 1) {
    const id = `scene_${String(i).padStart(3, "0")}`;
    if (!used.has(id)) return id;
  }
  return `scene_${Date.now()}`;
}

function openSceneCreate() {
  if (!state.projectDir || !state.project) {
    setStatus("未打开项目", "warn");
    return;
  }
  if (!els.sceneModal || !els.sceneIdInput) return;
  els.sceneModal.hidden = false;
  els.sceneIdInput.value = buildDefaultSceneId();
  els.sceneIdInput.focus();
  els.sceneIdInput.select();
}

function closeSceneCreate() {
  if (!els.sceneModal || !els.sceneIdInput) return;
  els.sceneModal.hidden = true;
  els.sceneIdInput.value = "";
}

async function confirmSceneCreate() {
  if (!state.projectDir || !state.project) {
    setStatus("未打开项目", "warn");
    return;
  }
  const sceneId = String(els.sceneIdInput?.value ?? "").trim();
  if (!sceneId) {
    setStatus("请输入场景 ID", "warn");
    return;
  }
  if (!/^[a-zA-Z0-9_\\-]+$/.test(sceneId)) {
    setStatus("场景 ID 仅允许字母/数字/下划线/短横线", "warn");
    return;
  }
  if (state.project.scenes.some((s) => s.id === sceneId)) {
    setStatus(`场景已存在：${sceneId}`, "warn");
    return;
  }
  if (state.dirtyGraph || state.dirtyLayout) {
    await saveGraphAndLayout();
  }

  const graphRel = `graphs/${sceneId}.graph.json`;
  const graphPath = api.pathJoin(state.projectDir, graphRel);
  try {
    await api.stat(graphPath);
    setStatus(`图文件已存在：${graphRel}`, "warn");
    return;
  } catch {
    // 不存在则继续
  }

  const startId = "n_start";
  const endId = "n_end";
  const graph = {
    sceneMeta: { entryNodeId: startId },
    nodes: [
      { id: startId, type: "Start", data: {} },
      { id: endId, type: "End", data: {} }
    ],
    edges: [
      {
        id: `e_${startId}_${endId}`,
        from: { nodeId: startId, portId: "out" },
        to: { nodeId: endId, portId: "in" }
      }
    ]
  };

  try {
    await api.writeJson(graphPath, graph);
    state.project.scenes.push({ id: sceneId, graph: graphRel });
    const projectPath = api.pathJoin(state.projectDir, "project.json");
    await api.writeJson(projectPath, state.project);
    closeSceneCreate();
    await renderScenes(sceneId);
    setStatus(`已新增场景：${sceneId}`);
  } catch (e) {
    setStatus(`新增场景失败：${e?.message ?? e}`, "error");
  }
}

async function loadScene(scene) {
  if (!state.projectDir) return;
  try {
    const graphPath = api.pathJoin(state.projectDir, scene.graph);
    const layoutRel = computeLayoutPath(scene.graph);
    const layoutPath = api.pathJoin(state.projectDir, layoutRel);
    const data = await api.readJson(graphPath);
    if (!Array.isArray(data.nodes)) data.nodes = [];
    if (!Array.isArray(data.edges)) data.edges = [];
    let layout = null;
    try {
      layout = await api.readJson(layoutPath);
    } catch {
      layout = { schemaVersion: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: {} };
    }
    if (!layout.nodes) layout.nodes = {};

    state.currentScene = scene;
    state.currentGraphPath = graphPath;
    state.currentLayoutPath = layoutPath;
    state.graph = data;
    state.layout = layout;
    state.selectedNodeId = null;
    state.dirtyGraph = false;
    state.dirtyLayout = false;

    ensureLayoutForNodes();
    const hasViewport =
      state.layout.viewport &&
      Number.isFinite(state.layout.viewport.x) &&
      Number.isFinite(state.layout.viewport.y) &&
      Number.isFinite(state.layout.viewport.zoom);
    if (hasViewport) {
      state.viewport = {
        x: Number(state.layout.viewport.x ?? 0),
        y: Number(state.layout.viewport.y ?? 0),
        zoom: Number(state.layout.viewport.zoom ?? 1)
      };
      state.autoFit = false;
    } else {
      state.viewport = { x: 0, y: 0, zoom: 1 };
      state.autoFit = true;
    }
    renderGraph();
    renderInspector(null);
    updateScenePreview();
    if (state.autoFit) fitToView(true);
    else applyTransform();
    setStatus(`已打开场景：${scene.id}`);
  } catch (e) {
    setStatus(`加载场景失败：${e?.message ?? e}`, "error");
  }
}

async function saveGraphAndLayout() {
  if (!state.currentGraphPath || !state.currentLayoutPath) {
    setStatus("未选择场景", "warn");
    return;
  }
  try {
    await api.writeJson(state.currentGraphPath, state.graph);
    await api.writeJson(state.currentLayoutPath, state.layout);
    state.dirtyGraph = false;
    state.dirtyLayout = false;
    setStatus("已保存");
  } catch (e) {
    setStatus(`保存失败：${e?.message ?? e}`, "error");
  }
}

async function formatGraph() {
  if (!state.graph) return;
  state.autoFit = true;
  fitToView(true);
  setStatus("已适应视图");
}

async function ensureSavedBeforeExport() {
  if (state.dirtyGraph || state.dirtyLayout) {
    await saveGraphAndLayout();
  }
}

async function compileProject() {
  if (!state.projectDir) {
    setStatus("未打开项目", "warn");
    return;
  }
  await ensureSavedBeforeExport();
  setStatus("编译中…");
  const result = await api.compileProject(state.projectDir);
  if (result.ok) {
    renderDiagnostics(result.diagnostics);
    setStatus("编译完成");
  } else {
    renderDiagnostics(result.diagnostics);
    setStatus(result.message ?? "编译失败", "error");
  }
}

async function exportWeb() {
  if (!state.projectDir) {
    setStatus("未打开项目", "warn");
    return;
  }
  await ensureSavedBeforeExport();
  const outDir = els.outDir.value.trim() || api.pathJoin(state.projectDir, "build", "web");
  setStatus("导出中…");
  try {
    const result = await api.exportWeb(state.projectDir, outDir);
    setStatus(`导出完成：${result.outDir}`);
  } catch (e) {
    setStatus(`导出失败：${e?.message ?? e}`, "error");
  }
}

async function previewWeb() {
  if (!state.projectDir) {
    setStatus("未打开项目", "warn");
    return;
  }
  await ensureSavedBeforeExport();
  const outDir = els.outDir.value.trim() || api.pathJoin(state.projectDir, "build", "web");
  setStatus("导出并启动预览…");
  try {
    const result = await api.exportWeb(state.projectDir, outDir);
    const url = await api.startPreview(result.outDir);
    window.open(url, "_blank");
    setStatus(`预览中：${url}`);
  } catch (e) {
    setStatus(`预览失败：${e?.message ?? e}`, "error");
  }
}

async function chooseOutDir() {
  if (!state.projectDir) {
    setStatus("未打开项目", "warn");
    return;
  }
  const dir = await api.selectOutputDir(els.outDir.value.trim() || state.projectDir);
  if (dir) {
    els.outDir.value = dir;
  }
}

function disableActions() {
  const buttons = [
    els.btnOpen,
    els.btnToggleLeft,
    els.btnReload,
    els.btnFormat,
    els.btnAddNode,
    els.btnAddScene,
    els.btnAddVar,
    els.btnSave,
    els.btnCompile,
    els.btnExport,
    els.btnPreview,
    els.btnChooseOut
  ];
  for (const btn of buttons) {
    if (btn) btn.disabled = true;
  }
  if (els.nodeTypeSelect) els.nodeTypeSelect.disabled = true;
}

if (!api) {
  setStatus("编辑器预加载失败：请通过 npm run dev:editor 启动（不要直接打开 HTML）", "error");
  clearDiagnostics();
  disableActions();
} else {
  els.btnOpen.addEventListener("click", openProject);
  els.btnToggleLeft.addEventListener("click", () => {
    if (!els.leftPanel) return;
    els.leftPanel.classList.toggle("open");
  });
  els.btnReload.addEventListener("click", () => state.projectDir && loadProject(state.projectDir));
  els.btnFormat.addEventListener("click", formatGraph);
  if (els.btnAddNode) {
    els.btnAddNode.addEventListener("click", () => {
      if (!state.graph) {
        setStatus("未打开项目", "warn");
        return;
      }
      const type = els.nodeTypeSelect?.value || "Dialogue";
      const pos = getViewportCenterGraph();
      addNodeAt(type, pos);
    });
  }
  if (els.btnAddScene) {
    els.btnAddScene.addEventListener("click", openSceneCreate);
  }
  if (els.btnSceneCreateOk) {
    els.btnSceneCreateOk.addEventListener("click", confirmSceneCreate);
  }
  if (els.btnSceneCreateCancel) {
    els.btnSceneCreateCancel.addEventListener("click", closeSceneCreate);
  }
  if (els.sceneModalBackdrop) {
    els.sceneModalBackdrop.addEventListener("click", closeSceneCreate);
  }
  if (els.sceneIdInput) {
    els.sceneIdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmSceneCreate();
      if (e.key === "Escape") closeSceneCreate();
    });
  }
  els.btnSave.addEventListener("click", saveGraphAndLayout);
  els.btnCompile.addEventListener("click", compileProject);
  els.btnExport.addEventListener("click", exportWeb);
  els.btnPreview.addEventListener("click", previewWeb);
  els.btnChooseOut.addEventListener("click", chooseOutDir);
  if (els.varTypeSelect) {
    els.varTypeSelect.addEventListener("change", () => {
      setVarFormByType(els.varTypeSelect.value);
    });
    setVarFormByType(els.varTypeSelect.value);
  }
  if (els.varFlagDefaultSelect) {
    setFlagSelect(false);
  }
  if (els.btnAddEnumValue) {
    els.btnAddEnumValue.addEventListener("click", addEnumValue);
  }
  if (els.varEnumValueInput) {
    els.varEnumValueInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addEnumValue();
      }
    });
  }
  if (els.btnAddVar) {
    els.btnAddVar.addEventListener("click", openVarCreate);
  }
  if (els.btnVarCreateOk) {
    els.btnVarCreateOk.addEventListener("click", confirmVarCreate);
  }
  if (els.btnVarCreateCancel) {
    els.btnVarCreateCancel.addEventListener("click", closeVarCreate);
  }
  if (els.varModalBackdrop) {
    els.varModalBackdrop.addEventListener("click", closeVarCreate);
  }
  if (els.varModal) {
    els.varModal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeVarCreate();
      }
      if (e.key === "Enter") {
        confirmVarCreate();
      }
    });
  }
  clearDiagnostics();
  els.graphViewport.addEventListener("click", (e) => {
    if (
      e.target === els.graphViewport ||
      e.target === els.graphCanvas ||
      e.target === els.graphNodes ||
      e.target === els.graphEdges
    ) {
      state.selectedNodeId = null;
      renderInspector(null);
      for (const el of state.nodeElements.values()) el.classList.remove("selected");
      renderEdges();
    }
  });
  els.graphViewport.addEventListener("dblclick", onViewportDoubleClick);
  els.graphViewport.addEventListener("pointerdown", onViewportPointerDown);
  els.graphViewport.addEventListener("pointermove", onViewportPointerMove);
  els.graphViewport.addEventListener("wheel", onViewportWheel, { passive: false });
  window.addEventListener("resize", () => {
    if (state.autoFit) fitToView(true);
    else applyTransform();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (isEditableTarget(e.target)) return;
      if (state.selectedNodeId) {
        deleteNode(state.selectedNodeId);
      }
    }
  });
  document.addEventListener(
    "wheel",
    (e) => {
      if (isEditableTarget(document.activeElement)) {
        e.stopPropagation();
      }
    },
    { capture: true, passive: true }
  );
  populateNodeTypeSelect();
}

function isEditableTarget(target) {
  if (!target || target === document.body || target === document.documentElement) return false;
  const el = /** @type {HTMLElement} */ (target);
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return Boolean(el.closest?.("input, textarea, select, [contenteditable=\"true\"]"));
}

function fitToView(force) {
  if (!state.graph || !state.layout) return;
  const positions = Object.values(state.layout.nodes ?? {});
  if (positions.length === 0) return;
  const rect = els.graphViewport.getBoundingClientRect();
  const minX = Math.min(...positions.map((p) => p.x ?? 0));
  const minY = Math.min(...positions.map((p) => p.y ?? 0));
  const maxX = Math.max(...positions.map((p) => (p.x ?? 0) + 220));
  const maxY = Math.max(...positions.map((p) => (p.y ?? 0) + 120));
  const contentW = maxX - minX + 160;
  const contentH = maxY - minY + 160;
  const zoomX = rect.width / contentW;
  const zoomY = rect.height / contentH;
  const zoom = Math.max(0.3, Math.min(1.2, Math.min(zoomX, zoomY)));

  if (!force && Math.abs(zoom - state.viewport.zoom) < 0.01) return;

  const x = rect.width / 2 - (minX + contentW / 2) * zoom;
  const y = rect.height / 2 - (minY + contentH / 2) * zoom;
  state.viewport = { x, y, zoom };
  state.layout.viewport = { ...state.viewport };
  state.dirtyLayout = true;
  applyTransform();
}

function populateNodeTypeSelect() {
  if (!els.nodeTypeSelect) return;
  els.nodeTypeSelect.innerHTML = "";
  const types = NODE_TYPE_ORDER.filter((t) => NODE_SCHEMA[t]);
  for (const type of types) {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = `${NODE_SCHEMA[type]?.label ?? type} (${type})`;
    els.nodeTypeSelect.appendChild(option);
  }
  if (!els.nodeTypeSelect.value) els.nodeTypeSelect.value = "Dialogue";
}
