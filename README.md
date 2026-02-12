# Galgame 节点图制作工具（Editor/Compiler/Runtime）架构设计

本仓库目标是开发一套 **面向非程序用户** 的 Galgame 制作工具：用 **节点图** 完成剧情、分支、演出与资源管理，并能导出到 **Web / macOS / iOS**（以 Web Runtime 为核心，跨平台一致性优先）。

> 设计约束：遵循 SOLID / KISS / DRY / YAGNI。第一版只做“能做出作品的最小闭环”，并把扩展点留在正确的位置（节点类型、导出器、校验器、资源导入器）。

---

## 1. 产品目标与非目标

### 目标
- **节点图驱动**：用图表达剧情流程、分支条件、变量变化、演出指令与跳转。
- **不会写代码也能用**：模板、强校验、人话化表单、错误定位、所见即所得预览。
- **兼容性强**：编辑器使用 Electron；运行时使用 Web 技术栈；导出以 Web 包为核心，再封装到 macOS/iOS。
- **可版本管理（Git 友好）**：项目工程以文本（JSON）为主，资源独立，避免巨大二进制工程文件。

### 非目标（第一版不做）
- 不做通用游戏引擎替代品（3D、复杂脚本、物理系统等）。
- 不做多人实时协作（后续可通过 Git 工作流协作）。
- 不强行支持多语言本地化（当前需求不需要）。

---

## 2. 总体架构（Editor → Compiler → Runtime）

核心思想：**编辑器负责“好用”**，**编译器负责“严格与可执行”**，**运行时负责“稳定跨平台播放”**。

```
┌──────────────────────────┐
│      Editor (Electron)   │
│  节点图/资源/预览/导出UI   │
└─────────────┬────────────┘
              │ Graph(编辑态)
              ▼
┌──────────────────────────┐
│     Compiler (Core)      │
│ 校验/规范化/资源清单/产物  │
└─────────────┬────────────┘
              │ IR(运行态)
              ▼
┌──────────────────────────┐
│    Runtime (Web)         │
│ 解释器/渲染/音频/存档/回看 │
└──────────────────────────┘
              │
              ▼
       Web / macOS / iOS
```

### 为什么需要 IR（中间表示）
节点图对人友好，但对运行不友好（存在布局信息、草稿状态、未连线、注释等）。  
引入 **IR（运行态中间表示）** 可以让 Runtime 足够简单：只要解释一套稳定指令即可，平台封装不影响逻辑执行。

---

## 3. 仓库与模块规划（Monorepo 推荐）

建议采用 Monorepo（例如 pnpm workspace / npm workspaces），将 UI、核心逻辑、运行时与导出器解耦。

```
/
  apps/
    editor-electron/        # Electron 编辑器（UI 为主）
  packages/
    core/                   # 领域模型 + 编译器（纯 TS，无平台依赖）
    runtime-web/            # Web 运行时（解释 IR 并渲染）
    exporters/              # 导出器集合（web/macos/ios）
    plugin-api/             # 插件协议与类型定义
```

职责边界（SOLID）：
- `packages/core`：唯一可信的“规则源”（Graph/IR/校验/编译）。
- `apps/editor-electron`：只关心交互与可视化，不直接写运行逻辑。
- `packages/runtime-web`：只关心 IR 执行，不理解编辑器布局/草稿。
- `packages/exporters`：只做打包与产物组织，不做剧情逻辑。

---

## 4. 项目工程格式（Project Layout，Git 友好）

目标：**可读、可 diff、可拆分、可回滚**，并支持大资源（音频/Live2D）使用 Git LFS。

建议的项目目录（一个游戏工程）：

```
MyGame/
  project.json                  # 工程配置（入口场景、分辨率等）
  variables.json                # 变量定义（flag/数值），含默认值与说明
  graphs/
    scene_001.graph.json        # 节点图（编辑态：逻辑）
    scene_001.layout.json       # 布局信息（坐标/缩放/折叠），不参与编译
  assets/
    bg/
    char/
    cg/
    audio/
      bgm/
      sfx/
      voice/
    live2d/
  build/                        # 导出产物（可删除）
```

约定：
- 所有资源引用使用 **稳定 ID**（例如 UUID），避免“改名/移动导致全局改动难以追踪”。
- `layout.json` 与 `graph.json` 分离：减少 Git 冲突，避免“挪动节点位置导致逻辑文件大变”。

---

## 5. 数据模型：Graph（编辑态）与 IR（运行态）

### 5.1 Graph（编辑态）
Graph 需要保留“对编辑有用但运行无用”的信息：
- 节点坐标、折叠分组、注释节点
- 未完成的草稿节点或临时连线

建议的最小字段集合（示意）：
- `nodes[]`: `{ id, type, data, ports }`
- `edges[]`: `{ id, from: {nodeId, portId}, to: {nodeId, portId} }`
- `sceneMeta`：保留字段（当前不再依赖 `entryNodeId`）

### 5.2 IR（运行态）
IR 只保留“运行需要的最小信息”，结构确定、可校验、可解释：
- 指令序列（或基本块 + 跳转）
- 标签/跳转表
- 初始变量
- 资源清单（manifest）

IR 指令建议保持“有限集合”（KISS），示例：
- `SET_BG(assetId, transition, durationMs)`
- `SHOW_CHAR(characterId, appearanceId, position, scale)`
- `LIVE2D_MOTION(characterId, motionId)`
- `SAY(speakerId, text, voiceAssetId?)`
- `CHOICE([{ text, gotoLabel }...])`
- `SET_VAR(name, op, value)`
- `IF(cond, gotoTrue, gotoFalse)`
- `JUMP(label)`
- `END()`

> 关键要求：Runtime 只需要理解 IR，不需要理解节点图的任何 UI 概念。

---

## 6. 编译器（Compiler）：校验、规范化与产物

编译器输出：
- `game.ir.json`：运行态 IR
- `manifest.json`：资源引用清单（用于导出、缺失检查、预加载策略）

### 6.1 强校验（非程序用户友好）
导出前必须做“阻断错误（Error）/ 警告（Warning）/ 建议（Hint）”分级：

阻断错误（必须修复才能导出）：
- 出口未连接导致死路（除非节点语义允许）
- 入口不可达 / 结局不可达
- 变量未定义或类型不匹配（布尔/数值）
- 资源缺失（图片/音频/Live2D 纹理/模型入口）
- 条件表达式不完整（例如缺比较值）

警告（可导出但建议修复）：
- 孤立节点（不可达）
- 同一角色同时存在多份互斥状态（可自动合并或提示）
- 音频通道冲突（例如 BGM 重叠但未设置淡出）

### 6.2 规范化（Graph → IR）
规范化目标：把“任意图”变为“确定可执行流程”：
- 选择节点（Choice）展开为可执行的选择指令与跳转目标
- 条件节点（Branch）统一为 `IF(cond)` + `goto` 结构
- 标签（Label）统一为跳转表条目

---

## 7. 节点系统设计（节点图制作核心）

第一版节点集合控制在 15～25 个以内，覆盖 80% Galgame 需求，避免“节点过多把新手淹没”。

### 7.1 推荐节点（MVP）
叙事类：
- `Start`：全局入口（仅入口场景允许）
- `Dialogue`：对白（角色名、文本、语音可选）
- `Narration`：旁白
- `Choice`：选项（多出口）
- `Jump`：跳转到标签/场景
- `End`：结束

变量与分支：
- `SetVariable`：设置 flag / 好感度 +1 等
- `Branch`：条件分支（可视化条件构建器）

演出与资源：
- `Background`：切换背景（过渡/时长）
- `Character`：显示/隐藏/切换表情/位置
- `BGM` / `SFX` / `Voice`：音频控制（淡入淡出/停止）

组织类：
- `Label`：标记跳转点
- `Comment`：注释（不参与编译）
- `Group/Subgraph`：折叠段落（提升可读性）

### 7.2 端口与规则（减少用户出错）
每种节点定义：
- 输入端口数量（0/1/多）
- 输出端口数量与语义（单出口/多出口/条件出口）
- 必填字段（例如资源必须选，文本可为空？）
- UI 控件类型（下拉/资源选择器/数值输入）

编辑器应做到：
- 即时校验与红黄提示
- 错误可点击定位节点
- 提供“模板节点块”（例如一段标准分支/一段标准演出）

---

## 8. Runtime（Web）：解释器 + 渲染 + 音频 + 存档

Runtime 目标：同一份 `game.ir.json` 在所有平台表现一致。

### 8.1 解释器（Interpreter）
- 输入：IR、初始变量、存档状态
- 输出：驱动渲染/音频/UI 的事件流或状态变更
- 状态：`pc(指令指针)`、`variables`、`callStack(可选)`、`history(已读标记)`

### 8.2 渲染系统（RenderSystem）
典型分层：
- 背景层（BG）
- 立绘层（Characters：静态与 Live2D）
- 特效层（淡入淡出/震动等，第一版尽量克制）
- UI 层（文本框、选项、菜单、回看）

### 8.3 音频系统（AudioSystem）
- 通道：BGM / SFX / Voice
- 能力：淡入淡出、停止、并发限制、音量分组

### 8.4 存档系统（SaveSystem）
存档最小信息：
- 当前执行位置（`pc` 或 label）
- 变量表（flags/数值）
- 必要的渲染状态（当前 BG、角色在场信息，可由 IR 重放恢复则不必存）
- 回看日志索引（可选：只存已读标记与日志指针）

### 8.5 回看/自动播放/快进（需求明确）
回看（Backlog）：
- 每次 `SAY` 追加 `{ speaker, text, voiceAssetId?, nodeId, timestamp }`
- 回看 UI 支持点击播放语音（如有）

自动播放（AutoPlay）：
- 计算等待时长：`max(文本估算时长, 配音时长)`，可配置系数
- 遇到 `Choice` 自动暂停

快进/跳过（Skip）：
- 跳过非交互指令
- 支持“仅跳过已读”：用 `ReadMarker` 记录已到达过的节点/行

> iOS 约束：音频播放通常需要用户手势触发。Runtime 需要“点击开始”引导页来初始化音频上下文。

---

## 9. Live2D 支持（静态 + Live2D）

目标：对用户而言，“角色节点”体验一致，只是在资源类型上不同。

### 9.1 依赖倒置：CharacterRenderer 抽象
- `StaticSpriteRenderer`：渲染静态立绘（PNG/WebP）
- `Live2DRenderer`：渲染 Live2D 模型（WebGL）

渲染选择由“角色当前外观资源”决定，而不是由节点类型分裂（避免 UI 复杂化、避免 DRY 破坏）。

### 9.2 Live2D 资源导入与索引
资源导入器负责：
- 识别 Live2D 模型入口（例如 `.model3.json`）
- 扫描依赖：纹理、motions、expressions
- 生成可供 Inspector 使用的下拉列表索引（动作/表情）

### 9.3 节点侧表达（对新手隐藏复杂度）
- `Character.Show`：选择角色 → 选择外观（静态图或 Live2D 模型）→ 位置/缩放
- `Character.Expression`：静态为切图；Live2D 为 expression
- `Character.Motion`：仅当当前外观为 Live2D 时展示

> 许可/分发：Live2D Cubism SDK 可能存在授权约束。建议把 Live2D 支持作为可选插件模块，避免核心 Runtime 被许可绑定。

---

## 10. 导出与平台策略（Web / macOS / iOS）

统一思路：所有平台的“内容”一致，都是：
- `runtime-web`（HTML/CSS/JS）
- `game.ir.json`
- `assets/`（及 `manifest.json`）

### 10.1 Web 导出（主路径）
产物：可静态部署的目录（适配任意静态托管/CDN）。

### 10.2 macOS 导出（两种壳策略，二选一）
策略 A：Electron Player 壳
- 优点：与编辑器技术栈一致，上手快
- 缺点：包体较大

策略 B：WKWebView 壳（更轻、更“原生”）
- 优点：包体小、启动快
- 缺点：需要额外壳工程与签名流程

### 10.3 iOS 导出（推荐）
导出 `www/` 静态目录 + `manifest.json`，由 iOS 壳（WKWebView/Capacitor）加载。

编辑器可提供“一键生成 iOS 壳模板工程”（模板化即可，避免把复杂工程细节暴露给非程序用户）。

---

## 11. 插件体系（扩展点，避免硬编码膨胀）

第一版可先做“内置节点 + 内置导出器”，但接口必须清晰，便于后续扩展：
- 新增节点类型：`registerNodeType(def)`
- 新增校验规则：`registerValidator(rule)`
- 新增导出器：`registerExporter(exporter)`
- 新增资源导入器：`registerAssetImporter(importer)`

插件建议以 `manifest.json` 描述，并带 `schemaVersion` 做兼容控制。

---

## 12. 编辑器（Electron）的非程序用户体验要点

必须优先实现的 UX（比“更多节点”更重要）：
- 模板驱动：新建“对白场景模板/分支模板/好感度模板”
- 强引导：“下一步”面板（缺入口、缺角色默认外观、缺资源引用等）
- 所见即所得预览：选中节点即可在右侧预览当前画面
- 错误列表：可点击定位到节点，并给出修复建议
- 一键整理布局：自动对齐/分组/折叠，降低节点图混乱
- 表单人话化：避免暴露 `if/else`、运算符等术语，用自然语言描述条件

---

## 13. 迭代路线（MVP → Live2D → 发布链路）

Phase 1：可做短篇（闭环）
- 节点：Start/Dialogue/Narration/Choice/Jump/End
- 资源：BG/立绘/BGM/SFX/Voice
- 系统：存档/回看/自动播放/快进（含仅跳过已读）
- 导出：Web

Phase 2：Live2D
- Live2D 导入器 + 资源索引
- Live2DRenderer（WebGL）
- 角色节点扩展（动作/表情）

Phase 3：发布
- macOS 壳（Electron Player 或 WKWebView）
- iOS 壳模板（WKWebView/Capacitor）+ 一键导出目录

---

## 14. 约定与质量门槛（建议）

- `packages/core` 不依赖 Electron/DOM API（保证可测试、可复用）。
- Graph/IR/Save 均提供 Schema 校验（导出前可给出明确错误）。
- 所有导出产物可复现（同输入工程 → 同输出结构），便于排查与 CI。
- 大资源使用 Git LFS；逻辑 JSON 保持稳定字段顺序或格式化（减少无意义 diff）。

---

## 15. 第一阶段 MVP（Web）已实现的闭环

本仓库当前已提供 **Web MVP 的可运行闭环**：`Graph(JSON)` → `Compiler(core)` → `IR+manifest` → `Runtime(Web)` → 本地预览。

包含的能力（MVP 范围）：
- 节点：Start / Dialogue / Narration / Choice / Jump / Label / End / Background / Character / SetVariable / Branch / BGM/SFX/Voice（音频）
- 系统：回看（Backlog）/ 自动播放（Auto）/ 快进（仅已读）/ 存档与读档（slot 1，基于 localStorage）
- 导出：Web（静态目录，可直接部署）

说明：
- Live2D 在架构上预留了 `renderer=live2d` 与资源导入入口，但 **MVP 阶段未集成实际 Live2D 渲染器**（运行时会提示但不崩溃）。Live2D 集成建议放到 Phase 2。

---

## 16. 快速开始（Web MVP）

### 16.1 环境要求
- Node.js >= 20（推荐 22+；当前开发环境可用 Node 24）

### 16.2 运行示例工程（MyGame）

在仓库根目录执行：

```bash
npm install
npm run dev:web
```

然后打开终端输出的地址（默认 `http://127.0.0.1:5173`）。

重要：
- 请 **不要** 直接用浏览器打开 `dist/web/index.html`（`file://`），浏览器会限制 `fetch` 加载 `game.ir.json/manifest.json`，导致页面停在“点击开始”且无法进入游戏。
- 必须通过本地静态服务器或任意 HTTP 服务器访问（本仓库已提供 `scripts/serve.js`）。

产物目录：
- `dist/web/`：Web 导出目录（可直接静态托管）
- `dist/web/game.ir.json`：编译后的 IR
- `dist/web/manifest.json`：资源清单
- `dist/web/diagnostics.json`：编译诊断（warning 也会写入）

### 16.3 导出任意项目目录

```bash
node "packages/export-web/cli.js" --project "examples/MyGame" --out "dist/web"
node "scripts/serve.js" "dist/web" --port 5173
```

---

## 17. 项目制作入口（当前阶段）

当前阶段已提供 Electron 编辑器的最小可用版（以 JSON 编辑为主），可视化节点图 UI 仍未实现。你可以先用 JSON 方式编写/生成节点图：
- 参考：`examples/MyGame/graphs/scene_001.graph.json`
- 项目配置：`examples/MyGame/project.json`
- 变量定义：`examples/MyGame/variables.json`

后续实现 Editor 时，目标是“编辑器写 Graph，编译器产 IR，运行时读 IR”，三者职责不变。

---

## 18. Electron 编辑器（最小可用版）

已提供一个 **最小可用的 Electron 编辑器**，当前能力定位为：
- 打开项目目录（读取 `project.json`）
- 选择场景并**可视化节点图**
- **表单化 Inspector** 编辑节点数据
- 节点拖拽调整布局（保存到 `.layout.json`）
- 一键编译校验（显示 diagnostics）
- 一键导出 Web
- 一键导出并本地预览（内置静态服务器）

### 18.1 启动方式

```bash
npm install
npm run dev:editor
```

启动后：
- 点击「打开项目」选择 `examples/MyGame`
- 在节点图选择节点，右侧 Inspector 编辑字段（未选择节点时 Inspector 不显示）
- 可拖拽节点调整布局，鼠标滚轮缩放，空白处拖拽平移画布
- 点击顶部「侧边栏」按钮展开/收起左侧面板
- 使用「新增节点」按钮或双击画布创建节点（类型从下拉选择）
- 选中节点后可按 `Delete/Backspace` 删除，或在 Inspector 中点击「删除节点」
- 点击「保存图」写回文件
- 点击「编译校验」查看诊断
- 点击「导出并预览」打开浏览器预览

说明：
- 该编辑器是 MVP 形态，当前**不支持拖拽连线与新增节点**（只做可视化、字段编辑与目标选择）
- 默认不提交 `.layout.json`（布局文件频繁变化），他人首次打开会自动生成布局
- 后续阶段会替换为更完整的节点图交互，但编译器与运行时不需要改动
- 请不要直接双击打开 `apps/editor-electron/renderer/index.html`，否则 `window.editorApi` 不会注入，按钮将不可用

---

## 19. Electron Player（macOS 运行与打包）

用途：将导出的 Web 产物作为桌面应用运行（避免 `file://` 限制），并可打包为 macOS `.app/.dmg`。

### 19.1 本地运行（开发）

```bash
npm run build:web
npm run dev:player
```

或指定任意导出目录：

```bash
npx electron "apps/player-electron" -- --content "<导出目录>"
```

可选参数：
- `--content` / `--dir`：导出目录
- `--port`：指定本地端口（默认自动）
- `GALGAME_CONTENT_DIR`：环境变量指定导出目录

### 19.2 打包为 macOS App（空壳）

打包结果为 **通用空壳**（不内置游戏数据），首次打开会弹出“选择导出目录”，可运行任何由本编辑器导出的 Web 产物。

步骤（最简）：
```bash
cd "apps/player-electron"
npm install -D electron-builder
npx electron-builder --mac
```

说明：
- 该模式不包含游戏数据，运行时需要手动选择导出目录（包含 `index.html/game.ir.json/manifest.json`）。
