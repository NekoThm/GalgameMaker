const $ = (selector) => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function nowMs() {
  return Date.now();
}

function estimateTextMs(text) {
  const len = (text ?? "").toString().length;
  return 800 + Math.min(6000, len * 55);
}

function createId(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

class Toast {
  constructor(el) {
    this.el = el;
    this.timer = null;
  }

  show(message, ms = 1600) {
    if (this.timer) window.clearTimeout(this.timer);
    this.el.textContent = message;
    this.el.classList.add("show");
    this.timer = window.setTimeout(() => {
      this.el.classList.remove("show");
    }, ms);
  }
}

class AudioManager {
  constructor() {
    /** @type {HTMLAudioElement|null} */
    this.bgm = null;
    this.unlocked = false;
  }

  async unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const a = new Audio();
      a.volume = 0;
      const playPromise = a.play();
      if (playPromise && typeof playPromise.then === "function") {
        await Promise.race([
          playPromise,
          new Promise((resolve) => {
            window.setTimeout(resolve, 300);
          })
        ]);
      }
      a.pause();
    } catch {
      // iOS/WKWebView 下可能仍需要真实音频，这里只保证不崩
    }
  }

  async playBgm(src, { volume = 1, loop = true, fadeMs = 0 } = {}) {
    await this.unlock();
    const v = clamp01(volume);
    if (!src) return;
    if (this.bgm && this.bgm.src.endsWith(src)) {
      this.bgm.volume = v;
      this.bgm.loop = loop;
      return;
    }
    if (this.bgm) {
      this.bgm.pause();
      this.bgm = null;
    }
    const a = new Audio(src);
    a.loop = loop;
    a.volume = fadeMs > 0 ? 0 : v;
    this.bgm = a;
    try {
      await a.play();
    } catch {
      // 用户未交互时可能会失败，交由 tap-to-start 解决
    }
    if (fadeMs > 0) {
      const start = nowMs();
      const tick = () => {
        const t = (nowMs() - start) / fadeMs;
        a.volume = clamp01(v * t);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  stopBgm({ fadeMs = 0 } = {}) {
    if (!this.bgm) return;
    const a = this.bgm;
    if (fadeMs <= 0) {
      a.pause();
      this.bgm = null;
      return;
    }
    const startVol = a.volume;
    const start = nowMs();
    const tick = () => {
      const t = (nowMs() - start) / fadeMs;
      a.volume = clamp01(startVol * (1 - t));
      if (t < 1) {
        requestAnimationFrame(tick);
        return;
      }
      a.pause();
      this.bgm = null;
    };
    requestAnimationFrame(tick);
  }

  async playOneShot(src, { volume = 1 } = {}) {
    await this.unlock();
    if (!src) return { durationMs: 0 };
    const a = new Audio(src);
    a.volume = clamp01(volume);
    const durationMs = await new Promise((resolve) => {
      const done = () => {
        const seconds = Number.isFinite(a.duration) ? a.duration : 0;
        resolve(Math.max(0, Math.floor(seconds * 1000)));
      };
      a.addEventListener("loadedmetadata", done, { once: true });
      a.addEventListener("error", () => resolve(0), { once: true });
      a.load();
    });
    try {
      await a.play();
    } catch {
      // ignore
    }
    return { durationMs };
  }
}

function setTapToStartHint(message) {
  const hint = document.querySelector(".tapToStartHint");
  if (hint) hint.textContent = message;
}

class Renderer {
  constructor({ bgEl, charsEl, toast }) {
    this.bgEl = bgEl;
    this.charsEl = charsEl;
    this.toast = toast;
    /** @type {Map<string, HTMLElement>} */
    this.characters = new Map();
  }

  setBackground(path) {
    if (!path) return;
    this.bgEl.style.backgroundImage = `url(${path})`;
  }

  setCharacter({ characterId, action, renderer, appearance, position, scale }) {
    if (!characterId) return;
    if (action === "hide") {
      const el = this.characters.get(characterId);
      if (el) el.remove();
      this.characters.delete(characterId);
      return;
    }

    if (renderer === "live2d") {
      this.toast.show("Live2D：MVP 阶段仅保留接口（未集成渲染器）");
      // 不崩溃，不阻塞流程
      return;
    }

    if (!appearance) return;
    let el = this.characters.get(characterId);
    if (!el) {
      el = document.createElement("div");
      el.className = "char";
      el.dataset.characterId = characterId;
      this.characters.set(characterId, el);
      this.charsEl.appendChild(el);
    }
    const posX = clamp01(position?.x ?? 0.5);
    const posY = clamp01(position?.y ?? 0);
    const img = document.createElement("img");
    img.alt = characterId;
    img.src = appearance;
    img.style.left = `${Math.floor(posX * 100)}%`;
    img.style.bottom = `${Math.floor(posY * 100)}%`;
    img.style.transform = `translateX(-50%) scale(${Number.isFinite(scale) ? scale : 1})`;
    img.style.opacity = "1";
    el.replaceChildren(img);
  }
}

class Overlay {
  constructor() {
    this.root = $("#overlay");
    this.titleEl = $("#overlayTitle");
    this.bodyEl = $("#overlayBody");
    $("#overlayClose").addEventListener("click", () => this.hide());
  }

  show({ title, bodyHtml }) {
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = bodyHtml;
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
    this.bodyEl.innerHTML = "";
  }

  get isOpen() {
    return !this.root.hidden;
  }
}

class Game {
  constructor({ ir, manifest }) {
    this.ir = ir;
    this.manifest = manifest;

    this.toast = new Toast($("#toast"));
    this.audio = new AudioManager();
    this.renderer = new Renderer({ bgEl: $("#bg"), charsEl: $("#chars"), toast: this.toast });
    this.overlay = new Overlay();

    this.textbox = $("#textbox");
    this.nameEl = $("#name");
    this.textEl = $("#text");
    this.hintEl = $("#hint");
    this.choicesEl = $("#choices");
    this.statusEl = $("#status");

    this.btnBacklog = $("#btnBacklog");
    this.btnSave = $("#btnSave");
    this.btnLoad = $("#btnLoad");
    this.btnAuto = $("#btnAuto");
    this.btnSkip = $("#btnSkip");

    this.projectId = ir.project?.id ?? "my-game";
    this.applyStageResolution();

    this.auto = false;
    /** @type {"off"|"read"|"all"} */
    this.skipMode = "off";

    this.autoTimer = null;
    this.pendingVoiceDurationMs = 0;

    this.state = this.createInitialState();

    this.bindUI();
    this.renderStatus();
  }

  applyStageResolution() {
    const stage = document.getElementById("stage");
    if (!stage) return;
    const resolution = this.ir.project?.resolution ?? {};
    const width = Number(resolution.width ?? 1280);
    const height = Number(resolution.height ?? 720);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    stage.style.width = `min(100vw, ${width}px)`;
    stage.style.aspectRatio = `${width} / ${height}`;
  }

  createInitialState() {
    const entrySceneId = this.ir.project.entry.sceneId;
    const entryScene = this.ir.scenes[entrySceneId];
    const entryNodeId = entryScene.entryNodeId;

    const vars = {};
    for (const [name, def] of Object.entries(this.ir.variables ?? {})) {
      if (def && typeof def === "object" && "default" in def) {
        vars[name] = def.default;
      }
    }

    return {
      sceneId: entrySceneId,
      nodeId: entryNodeId,
      variables: vars,
      backlog: [],
      read: {}
    };
  }

  bindUI() {
    const proceed = () => {
      if (this.overlay.isOpen) return;
      if (this.awaitingChoice) return;
      if (!this.awaitingSay) return;
      this.awaitingSay = false;
      this.moveTo(this.awaitingSayNext);
      this.advance();
    };

    this.textbox.addEventListener("click", proceed);
    this.textbox.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") proceed();
    });

    this.btnBacklog.addEventListener("click", () => this.showBacklog());
    this.btnSave.addEventListener("click", () => this.saveToSlot(1));
    this.btnLoad.addEventListener("click", () => this.loadFromSlot(1));

    this.btnAuto.addEventListener("click", () => {
      this.auto = !this.auto;
      this.btnAuto.setAttribute("aria-pressed", this.auto ? "true" : "false");
      this.toast.show(this.auto ? "自动播放：开启" : "自动播放：关闭");
      this.renderStatus();
      if (this.auto) this.maybeScheduleAutoNext();
      else this.clearAutoTimer();
    });

    this.btnSkip.addEventListener("click", () => {
      this.skipMode = this.skipMode === "read" ? "off" : "read";
      this.btnSkip.setAttribute("aria-pressed", this.skipMode === "read" ? "true" : "false");
      this.toast.show(this.skipMode === "read" ? "快进(已读)：开启" : "快进：关闭");
      this.renderStatus();
      if (this.skipMode !== "off") this.advance();
    });
  }

  renderStatus() {
    this.statusEl.textContent = `场景: ${this.state.sceneId}  |  自动: ${this.auto ? "开" : "关"}  |  快进: ${
      this.skipMode === "off" ? "关" : this.skipMode
    }`;
  }

  clearAutoTimer() {
    if (this.autoTimer) {
      window.clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  }

  markRead(sceneId, nodeId) {
    const key = `${sceneId}:${nodeId}`;
    this.state.read[key] = true;
  }

  isRead(sceneId, nodeId) {
    const key = `${sceneId}:${nodeId}`;
    return Boolean(this.state.read[key]);
  }

  getCurrentNode() {
    const scene = this.ir.scenes[this.state.sceneId];
    if (!scene) throw new Error(`Scene not found: ${this.state.sceneId}`);
    const node = scene.nodes[this.state.nodeId];
    if (!node) throw new Error(`Node not found: ${this.state.sceneId}:${this.state.nodeId}`);
    return node;
  }

  moveTo(nodeId) {
    this.state.nodeId = nodeId;
  }

  showChoices(choices) {
    this.awaitingChoice = true;
    this.choicesEl.replaceChildren();
    for (const choice of choices) {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.type = "button";
      btn.textContent = choice.text;
      btn.addEventListener("click", () => {
        this.awaitingChoice = false;
        this.choicesEl.replaceChildren();
        this.moveTo(choice.to);
        this.advance();
      });
      this.choicesEl.appendChild(btn);
    }
  }

  showSay({ speaker, text }) {
    this.awaitingSay = true;
    this.nameEl.textContent = speaker ?? "";
    this.textEl.textContent = text ?? "";
    this.hintEl.textContent = this.auto ? "自动中…" : "点击继续";
  }

  clearSay() {
    this.awaitingSay = false;
    this.nameEl.textContent = "";
    this.textEl.textContent = "";
    this.hintEl.textContent = "";
  }

  addBacklog({ speaker, text, voice }) {
    this.state.backlog.push({
      id: createId("log"),
      speaker: speaker ?? "",
      text: text ?? "",
      voice: voice ?? null
    });
    if (this.state.backlog.length > 500) this.state.backlog.shift();
  }

  showBacklog() {
    const body = this.state.backlog
      .slice()
      .reverse()
      .map((item) => {
        const speakerHtml = item.speaker ? `<div class="backlogSpeaker">${escapeHtml(item.speaker)}</div>` : "";
        const textHtml = `<div class="backlogText">${escapeHtml(item.text)}</div>`;
        return `<div class="backlogItem">${speakerHtml}${textHtml}</div>`;
      })
      .join("");
    this.overlay.show({ title: "回看", bodyHtml: body || "<div>暂无记录</div>" });
    this.clearAutoTimer();
  }

  saveKey(slot) {
    return `galgame_save_v1:${this.projectId}:slot:${slot}`;
  }

  saveToSlot(slot) {
    try {
      const payload = {
        schemaVersion: 1,
        savedAt: new Date().toISOString(),
        state: this.state
      };
      localStorage.setItem(this.saveKey(slot), JSON.stringify(payload));
      this.toast.show(`已存档（槽位 ${slot}）`);
    } catch (e) {
      this.toast.show("存档失败（localStorage 不可用）");
      console.error(e);
    }
  }

  loadFromSlot(slot) {
    try {
      const raw = localStorage.getItem(this.saveKey(slot));
      if (!raw) {
        this.toast.show(`槽位 ${slot} 为空`);
        return;
      }
      const payload = JSON.parse(raw);
      if (!payload || payload.schemaVersion !== 1 || !payload.state) {
        this.toast.show("读档失败（存档版本不兼容）");
        return;
      }
      this.state = payload.state;
      this.toast.show(`已读档（槽位 ${slot}）`);
      this.renderStatus();
      this.advance(true);
    } catch (e) {
      this.toast.show("读档失败");
      console.error(e);
    }
  }

  setTapToStartOverlay() {
    // 已由 bootstrapStart 统一处理（避免 JSON 加载失败时无法点击）
  }

  async maybeScheduleAutoNext() {
    if (!this.auto) return;
    if (!this.awaitingSay) return;
    if (this.overlay.isOpen) return;
    this.clearAutoTimer();

    const text = this.textEl.textContent ?? "";
    const base = estimateTextMs(text);
    const voice = this.pendingVoiceDurationMs ?? 0;
    const delay = Math.max(base, voice);
    this.autoTimer = window.setTimeout(() => {
      if (!this.auto) return;
      if (!this.awaitingSay) return;
      this.textbox.click();
    }, delay);
  }

  evaluateCondition(cond) {
    if (!cond || typeof cond !== "object") return false;
    const op = cond.op;
    if (op === "and") return (cond.items ?? []).every((c) => this.evaluateCondition(c));
    if (op === "or") return (cond.items ?? []).some((c) => this.evaluateCondition(c));

    const v = this.state.variables[cond.var];
    if (op === "truthy") return Boolean(v);
    if (op === "falsy") return !v;

    const right = cond.value;
    if (op === "eq") return v === right;
    if (op === "neq") return v !== right;
    if (op === "gt") return Number(v) > Number(right);
    if (op === "gte") return Number(v) >= Number(right);
    if (op === "lt") return Number(v) < Number(right);
    if (op === "lte") return Number(v) <= Number(right);
    return false;
  }

  applySetVar(node) {
    const name = node.name;
    const opType = node.opType ?? "set";
    if (!name) return;
    if (opType === "set") this.state.variables[name] = node.value;
    else if (opType === "add") this.state.variables[name] = Number(this.state.variables[name] ?? 0) + Number(node.value ?? 0);
    else this.state.variables[name] = node.value;
  }

  clearBlockingState() {
    this.awaitingSay = false;
    this.awaitingSayNext = null;
    this.awaitingChoice = false;
    this.pendingVoiceDurationMs = 0;
    this.clearAutoTimer();
  }

  /**
   * @param {boolean} [forceRender]
   */
  async advance(forceRender = false) {
    if (!forceRender && (this.overlay.isOpen || this.awaitingChoice)) return;
    this.clearBlockingState();
    this.choicesEl.replaceChildren();
    this.clearSay();

    let guard = 0;
    while (guard++ < 2000) {
      const node = this.getCurrentNode();
      const visitedBefore = this.isRead(this.state.sceneId, this.state.nodeId);
      this.markRead(this.state.sceneId, this.state.nodeId);

      if (node.op === "END") {
        this.showSay({ speaker: "", text: "（完）" });
        this.awaitingSay = false;
        this.hintEl.textContent = "";
        this.toast.show("到达结局");
        this.renderStatus();
        return;
      }

      if (node.op === "SET_BG") {
        this.renderer.setBackground(node.background);
        this.moveTo(node.next);
        continue;
      }

      if (node.op === "CHAR") {
        this.renderer.setCharacter(node);
        this.moveTo(node.next);
        continue;
      }

      if (node.op === "AUDIO") {
        const ch = node.channel;
        if (ch === "bgm") {
          if (node.action === "stop") this.audio.stopBgm({ fadeMs: node.fadeMs ?? 0 });
          else await this.audio.playBgm(node.audio, { volume: node.volume ?? 1, loop: Boolean(node.loop), fadeMs: node.fadeMs ?? 0 });
        } else {
          if (node.action !== "stop") await this.audio.playOneShot(node.audio, { volume: node.volume ?? 1 });
        }
        this.moveTo(node.next);
        continue;
      }

      if (node.op === "SET_VAR") {
        this.applySetVar(node);
        this.moveTo(node.next);
        continue;
      }

      if (node.op === "IF") {
        const ok = this.evaluateCondition(node.cond);
        this.moveTo(ok ? node.then : node.else);
        continue;
      }

      if (node.op === "JUMP") {
        if (!node.to) throw new Error("Jump target missing");
        this.moveTo(node.to);
        continue;
      }

      if (node.op === "NOP") {
        if (!node.next) throw new Error("NOP next missing");
        this.moveTo(node.next);
        continue;
      }

      if (node.op === "CHOICE") {
        this.showChoices(node.choices ?? []);
        this.renderStatus();
        return;
      }

      if (node.op === "SAY") {
        const shouldSkip =
          this.skipMode === "all" || (this.skipMode === "read" && visitedBefore && !this.overlay.isOpen);
        if (shouldSkip) {
          this.moveTo(node.next);
          continue;
        }

        this.addBacklog({ speaker: node.speaker, text: node.text, voice: node.voice });
        this.showSay({ speaker: node.speaker, text: node.text });
        this.awaitingSayNext = node.next;

        this.pendingVoiceDurationMs = 0;
        if (node.voice) {
          const { durationMs } = await this.audio.playOneShot(node.voice, { volume: 1 });
          this.pendingVoiceDurationMs = durationMs;
        }

        this.renderStatus();
        await this.maybeScheduleAutoNext();
        return;
      }

      throw new Error(`Unknown op: ${node.op}`);
    }

    throw new Error("Advance guard exceeded (possible infinite loop)");
  }
}

function escapeHtml(text) {
  return (text ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadJson(path, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e && e.name === "AbortError") {
      throw new Error(`Timeout loading ${path}`);
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

function setFatalError(message) {
  const status = $("#status");
  status.textContent = message;
  status.style.color = "var(--danger)";
}

function isLikelyFileProtocol() {
  try {
    return window.location.protocol === "file:";
  } catch {
    return false;
  }
}

function bootstrapStart() {
  const tap = $("#tapToStart");
  const unlocker = new AudioManager();
  let starting = false;

  if (isLikelyFileProtocol()) {
    setTapToStartHint("检测到 file:// 打开，资源加载会失败；请用本地服务器打开（例如 npm run dev:web）");
  } else {
    setTapToStartHint("点击开始（用于解锁音频，并加载游戏资源）");
  }

  const start = async () => {
    if (starting) return;
    starting = true;
    setTapToStartHint("加载中…");
    try {
      // 先在用户手势内触发解锁（不阻塞后续资源加载）
      unlocker.unlock();

      setTapToStartHint("加载 game.ir.json…");
      const ir = await loadJson("./game.ir.json");
      setTapToStartHint("加载 manifest.json…");
      const manifest = await loadJson("./manifest.json");
      document.title = ir.project?.title ?? "Galgame Runtime";

      const game = new Game({ ir, manifest });
      // 复用已解锁的策略：Game 内部 AudioManager 也会自解锁，这里不强耦合共享实例
      tap.style.display = "none";
      await game.advance(true);
    } catch (e) {
      console.error(e);
      starting = false;
      tap.style.display = "grid";
      setFatalError(`启动失败：${String(e?.message ?? e)}`);
      if (isLikelyFileProtocol()) {
        setTapToStartHint("请不要直接双击打开 index.html；改用本地服务器（npm run dev:web），然后刷新重试");
      } else {
        setTapToStartHint("点击重试（如在 iOS 上，请确认已允许音频/未被静音开关影响）");
      }
    }
  };

  tap.onclick = start;
  tap.addEventListener("click", start, { passive: true });
  tap.addEventListener("pointerdown", start, { passive: true });
  tap.addEventListener("touchstart", start, { passive: true });
  document.addEventListener(
    "pointerdown",
    () => {
      if (tap.style.display !== "none") start();
    },
    { passive: true, capture: true }
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") start();
  });

  window.__galgameStart = start;
}

bootstrapStart();
