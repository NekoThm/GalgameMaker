const api = window.editorApi ?? null;

const els = {
  btnOpen: document.getElementById("btnOpen"),
  btnReload: document.getElementById("btnReload"),
  btnFormat: document.getElementById("btnFormat"),
  btnSave: document.getElementById("btnSave"),
  btnCompile: document.getElementById("btnCompile"),
  btnExport: document.getElementById("btnExport"),
  btnPreview: document.getElementById("btnPreview"),
  btnChooseOut: document.getElementById("btnChooseOut"),
  projectPath: document.getElementById("projectPath"),
  sceneList: document.getElementById("sceneList"),
  graphEditor: document.getElementById("graphEditor"),
  diagnostics: document.getElementById("diagnostics"),
  outDir: document.getElementById("outDir"),
  status: document.getElementById("status")
};

const state = {
  projectDir: null,
  project: null,
  currentScene: null,
  currentGraphPath: null
};

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

async function openProject() {
  const dir = await api.selectProjectDir();
  if (!dir) return;
  await loadProject(dir);
}

async function loadProject(projectDir) {
  try {
    const projectPath = api.pathJoin(projectDir, "project.json");
    const project = await api.readJson(projectPath);
    state.projectDir = projectDir;
    state.project = project;
    els.projectPath.textContent = projectDir;
    els.outDir.value = api.pathJoin(projectDir, "build", "web");
    await renderScenes();
    clearDiagnostics();
    setStatus("项目已加载");
  } catch (e) {
    setStatus(`加载失败：${e?.message ?? e}`, "error");
  }
}

async function renderScenes() {
  els.sceneList.innerHTML = "";
  if (!state.project || !Array.isArray(state.project.scenes)) return;
  for (const scene of state.project.scenes) {
    const btn = document.createElement("button");
    btn.textContent = `${scene.id ?? "scene"}  |  ${scene.graph ?? ""}`;
    btn.addEventListener("click", () => loadScene(scene));
    els.sceneList.appendChild(btn);
  }
  if (state.project.scenes.length > 0) {
    await loadScene(state.project.scenes[0]);
  }
}

async function loadScene(scene) {
  if (!state.projectDir) return;
  try {
    const graphPath = api.pathJoin(state.projectDir, scene.graph);
    const data = await api.readJson(graphPath);
    state.currentScene = scene;
    state.currentGraphPath = graphPath;
    els.graphEditor.value = JSON.stringify(data, null, 2);
    setStatus(`已打开场景：${scene.id}`);
  } catch (e) {
    setStatus(`加载场景失败：${e?.message ?? e}`, "error");
  }
}

function parseEditorJson() {
  const text = els.graphEditor.value;
  const data = JSON.parse(text);
  return { data, text };
}

async function saveGraph() {
  if (!state.currentGraphPath) {
    setStatus("未选择场景", "warn");
    return;
  }
  try {
    const { data } = parseEditorJson();
    await api.writeJson(state.currentGraphPath, data);
    els.graphEditor.value = JSON.stringify(data, null, 2);
    setStatus("已保存");
  } catch (e) {
    setStatus(`保存失败：${e?.message ?? e}`, "error");
  }
}

async function formatGraph() {
  try {
    const { data } = parseEditorJson();
    els.graphEditor.value = JSON.stringify(data, null, 2);
    setStatus("已格式化");
  } catch (e) {
    setStatus(`格式化失败：${e?.message ?? e}`, "error");
  }
}

async function compileProject() {
  if (!state.projectDir) {
    setStatus("未打开项目", "warn");
    return;
  }
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
    els.btnReload,
    els.btnFormat,
    els.btnSave,
    els.btnCompile,
    els.btnExport,
    els.btnPreview,
    els.btnChooseOut
  ];
  for (const btn of buttons) {
    if (btn) btn.disabled = true;
  }
}

if (!api) {
  setStatus("编辑器预加载失败：请通过 npm run dev:editor 启动（不要直接打开 HTML）", "error");
  clearDiagnostics();
  disableActions();
} else {
  els.btnOpen.addEventListener("click", openProject);
  els.btnReload.addEventListener("click", () => state.projectDir && loadProject(state.projectDir));
  els.btnFormat.addEventListener("click", formatGraph);
  els.btnSave.addEventListener("click", saveGraph);
  els.btnCompile.addEventListener("click", compileProject);
  els.btnExport.addEventListener("click", exportWeb);
  els.btnPreview.addEventListener("click", previewWeb);
  els.btnChooseOut.addEventListener("click", chooseOutDir);
  clearDiagnostics();
}
