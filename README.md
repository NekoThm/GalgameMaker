# Galgame Maker

面向非程序用户的 Galgame 制作工具：用**节点图**完成剧情与演出，并导出为可运行的 **Web 产物**，再通过 **Electron Player** 打包为桌面应用。

---

## 1. 项目介绍

- **目标用户**：不懂代码也能制作 Galgame。
- **核心理念**：编辑器负责“好用”，编译器负责“严格”，运行时负责“稳定”。
- **当前形态**：
  - **Editor（Electron）**：可视化节点图 + 表单式 Inspector
  - **Compiler（Node.js）**：Graph → IR，严格校验
  - **Runtime（Web）**：解释 IR 并渲染
  - **Player（Electron）**：桌面外壳运行导出产物

---

## 2. 使用方法（Editor + Player）

### 2.1 环境要求
- Node.js >= 20（推荐 22+）

### 2.2 安装依赖
```bash
npm install
```

### 2.3 启动 Editor
```bash
npm run dev:editor
```

编辑器内操作：
- **新建项目** / **打开项目**
- **新增 / 删除场景**
- **创建节点**（按钮或双击画布）
- **拖拽连线**（从端口拖到端口）
- **Inspector 编辑节点参数**
- **保存 / 编译校验 / 导出 Web / 导出并预览**

### 2.4 启动 Player（本地运行）
Player 是**通用空壳**，运行时会让你选择导出的 Web 目录：
```bash
npm run build:web
npm run dev:player
```

也可以手动指定目录：
```bash
npx electron "apps/player-electron" -- --content "<导出目录>"
```

### 2.5 打包 Player（macOS）
```bash
cd "apps/player-electron"
npx electron-builder --mac
```
产物在 `apps/player-electron/dist/`，**默认为空壳**，启动时会提示选择导出目录。

---

## 3. 节点功能与使用方法

> 下列节点的字段通过 Inspector 设置。连线从端口出发，所有节点都基于 **输入 → 输出** 流程执行。

### 3.1 叙事类
- **Start**：入口节点（仅入口场景允许且必须只有一个）  
  - 需要 1 条出边
- **Dialogue**：对白  
  - `speaker` 角色名、`text` 文本、`voice` 语音可选
- **Narration**：旁白  
  - `text` 文本、`voice` 语音可选
- **Choice**：选项  
  - 至少 2 条出边，**边上的文字作为选项文本**
- **Jump / Label**：跳转与标签  
  - Jump 使用 `targetLabel` 跳到 Label
- **End**：结束

### 3.2 变量与分支
- **SetVariable**：设置变量  
  - `name` 变量名、`op`（set/add）、`value`  
  - 必须有 1 条出边
- **Branch**：条件分支  
  - `cond` 条件  
  - 必须同时有 `then/else` 两条出边

### 3.3 演出与资源
- **Background**：背景切换  
  - `background` 路径、`transition`、`durationMs`  
  - 必须有 1 条出边
- **Character**：立绘显示/隐藏  
  - `action`（show/hide）、`characterId`、`renderer`、`appearance`  
  - `position.x/y`、`scale`
- **BGM / SFX / Voice**：音频  
  - `audio` 路径、`action`、`volume`、`loop`、`fadeMs`

### 3.4 场景跳转
- **SwitchScene**：切换场景  
  - 必填 `sceneId` + `nodeId`  
  - **不会自动跳入口**，必须指定目标节点

---

## 4. 关键特性说明

### 4.1 入口场景与 Start 约束
- 入口场景由 `project.json` 的 `entry.sceneId` 决定。
- **只有入口场景允许 Start**，且只能有一个。
- 其他场景必须通过 **SwitchScene** 进入（并指定 `nodeId`）。
- `sceneMeta.entryNodeId` 不再作为入口依据。

### 4.2 变量系统
变量在 `variables.json` 定义，类型：
- `flag` / `number` / `enum`
编辑器提供新增 / 编辑 / 删除。

### 4.3 资源路径
所有资源路径（图片/音频/Live2D）以**项目根目录相对路径**保存。

### 4.4 运行方式限制
- 浏览器 **不能** 直接打开 `file://` 的 `index.html`（会阻止 `fetch` 加载 `game.ir.json/manifest.json`）。
- 请使用内置预览、HTTP 服务器，或 Electron Player。

---

## 5. Example 使用说明（`examples/MyGame`）

### 5.1 在 Editor 中打开示例
1. 启动 Editor：`npm run dev:editor`
2. 点击「打开项目」选择 `"examples/MyGame"`
3. 选择场景，编辑节点参数，保存/编译/导出

### 5.2 命令行导出并预览
```bash
node "packages/export-web/cli.js" --project "examples/MyGame" --out "dist/web"
node "scripts/serve.js" "dist/web" --port 5173
```
浏览器访问 `http://127.0.0.1:5173/`。

---

## 6. 其它说明

### 6.1 目录结构
```
apps/
  editor-electron/      # 编辑器
  player-electron/      # Player（空壳）
packages/
  core/                 # 编译器
  runtime-web/          # Web 运行时
  export-web/           # Web 导出器
examples/
  MyGame/               # 示例工程
```

### 6.2 导出产物
导出 Web 后会生成：
- `index.html`
- `game.ir.json`
- `manifest.json`
- 资源文件（图片 / 音频）

这些文件可以部署到任意静态托管，也可由 Player 加载。

### 6.3 Live2D 状态
Live2D 在结构上预留了 `renderer=live2d`，但 MVP 阶段未集成实际渲染器。

### 6.4 许可证
暂未声明许可证（License TBD）。
