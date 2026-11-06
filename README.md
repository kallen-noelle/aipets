# aipets

Windows 11 桌面宠物，以 LangChain 为核心的独立重写工程。原项目
`apps/stage-web-react` 只作为行为参照，代码在新工程内重新组织。

工程同时提供两种形态，构建时分成两个入口，互不加载对方的页面：

| 形态 | 入口 | 运行方式 | 页面 |
| --- | --- | --- | --- |
| 网页版 | `index.html` | `npm run dev` / `npm run preview` | 舞台、网页桌宠、设置 |
| 桌面版 | `desktop.html` | Electron / 便携版 `aipets.exe` | 桌宠窗口、聊天窗口、聊天悬浮球、设置 |

桌面版没有网页版舞台。桌面版的所有窗口由 Electron 主进程管理，网页版只在浏览器里
运行；两者共享角色、对话、配置与设置页等核心模块。

## 功能概览

- 多角色实例：每个启用实例一个桌宠窗口，可单独启用、缩放、镜像、换角色。
- 角色动画：待机、说话、思考、被点击、被拖拽五种状态，外加情绪与长动作播放池。
- LLM 动画导演：每轮回复后由模型选择动作序列；长动作 `start → loop*n → end`。
- 环境编排：回复结束后由模型生成一段以约 24 小时为期望的动作序列，
  短片播一次、长动作按 `durationMs` 循环保持。
- 规则导演兜底：没有导演模型或环境编排未成功时，角色继续按规则播放待机。
- 对话：OpenAI 兼容接口，流式输出，失败自动回退一次性调用。
- 记忆：短期历史窗口、长期记忆提取、记忆条目与配方。
- 语音：接口 TTS 与系统语音，两种引擎自动回退；支持本地识别、接口转写、
  唤醒词与声纹配置。
- 工具：网络搜索、Home Assistant、MCP 工具、更新好感度、提议配方。
- 表达：回复贴纸、图像生成、工具卡片展示。
- 桌面能力：透明置顶桌宠、鼠标穿透、托盘、全局快捷键、聊天悬浮球、窗口位置记忆。
- 主题：浅色、深色、跟随系统。
- 配置：分域持久化，支持导入导出聊天记录、重置提供商与清空全部配置。

## 技术栈

- React 19 + TypeScript
- Vite 8
- Tailwind CSS 4 + shadcn/radix
- react-router（HashRouter）
- zustand（配置域与持久化）
- zod（配置与模型输出校验）
- LangChain（`createAgent`、`ChatOpenAI`、摘要中间件、工具）
- axios
- React Hook Form
- Electron 33 + electron-builder
- Vitest

## 快速开始

### 环境要求

- Node.js 20.19+ 或 22.12+（Vite 8 的 engines 要求）
- Windows 10/11
- npm（工程已有 `package-lock.json`，沿用 npm）

工程根目录的 `.npmrc` 已配置 Electron 与 electron-builder 的国内镜像。

### 安装依赖

```sh
npm install
```

### 网页版开发

```sh
npm run dev
```

打开 `http://127.0.0.1:5173/#/`：

- `#/` 整页舞台，角色与聊天悬浮球。
- `#/pet` 网页桌宠页。
- `#/settings` 网页设置。

网页版角色资源由 Vite 中间件把 `/characters/*` 映射到
`assets/characters`，与桌面版共用同一份素材。

### 桌面版开发

```sh
npm run dev:electron
```

这条命令会同时启动 Vite 和 Electron，桌面版加载
`http://127.0.0.1:5173/desktop.html`，不需要先手动起网页。

### 生产构建

```sh
npm run build          # tsc -b + vite build，产出 dist/index.html 与 dist/desktop.html
npm run preview        # 预览生产构建，角色资源同样可读
```

### 打包 Windows

```sh
npm run dist
```

产出：

- `release/aipets.exe`：便携单文件版，双击即可运行，不依赖开发服务器。
- `release/aipets Setup 0.0.0.exe`：NSIS 安装包，可选择安装目录、创建快捷方式。

### 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 只起网页开发服务器（5173） |
| `npm run dev:electron` | Vite + Electron 桌面开发 |
| `npm run build` | 类型检查与前端构建 |
| `npm run preview` | 预览生产构建（4173） |
| `npm run dist` | 构建并打出 Windows 安装包与便携版 |
| `npm run characters` | 从原工程资源重建角色索引 |
| `npm run test` | Vitest |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## 目录结构

```text
aipets/
├─ index.html                    网页入口
├─ desktop.html                  桌面入口
├─ assets/characters/            五个角色的视频与 characters.config.json
├─ electron/
│  ├─ main.cjs                   主进程：窗口、托盘、穿透、拖拽、悬浮球、配置目录
│  ├─ preload.cjs                类型化桌面桥
│  ├─ windows.cjs                聊天/设置窗口管理
│  ├─ resource-server.cjs        打包后角色资源的本地 HTTP 服务
│  ├─ shared/
│  │  ├─ contract.cjs            IPC 通道名
│  │  └─ store.cjs               主进程 JSON 存储
│  ├─ plugins/                   本地插件宿主与游戏窗口
│  └─ resources/                 图标等构建资源
├─ scripts/build-characters.mjs  角色索引生成脚本
├─ src/
│  ├─ app/bootstrap.ts           两个入口共用的启动流程
│  ├─ apps/
│  │  ├─ web/                    网页入口、路由与舞台/网页桌宠页面
│  │  └─ desktop/                桌面入口、路由与桌宠/聊天/悬浮球页面
│  ├─ character/                 纯 TS 动画逻辑：状态机、导演、播放器、片段、环境编排
│  ├─ config/                    配置域，一域一 store 一 schema 一存储键
│  ├─ llm/                       LangChain 封装、角色 Agent、对话导演、环境编排
│  ├─ speech/                    TTS、ASR、录音与设备
│  ├─ memory/                    长期记忆提取
│  ├─ mcp/                       MCP 客户端与工具桥
│  ├─ image/                     图像生成
│  ├─ audio/                     节拍检测与麦克风
│  ├─ weather/                   IP 定位与 Open-Meteo 天气
│  ├─ desktop/                   preload 桥类型、实例同步、跨窗口事件、电池
│  ├─ debug/                     调试监控
│  └─ ui/                        React 组件、设置页、UI 基础件
├─ public/
├─ dist/                         Vite 产物
└─ release/                      electron-builder 产物
```

## 双入口与共享层

构建配置在 [vite.config.ts](vite.config.ts) 中声明两个 HTML 入口：

- `index.html` → `src/apps/web/main.tsx`，只注册网页路由。
- `desktop.html` → `src/apps/desktop/main.tsx`，只注册桌面路由。

桌面版路由：

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `#/pet` | 桌宠窗口 | 透明窗口，只显示一个实例 |
| `#/chat` | 聊天窗口 | 只有聊天面板，没有舞台入口 |
| `#/ball` | 聊天悬浮球 | 64x64 透明置顶窗口 |
| `#/settings` | 设置 | 不显示“返回舞台”入口 |

网页版路由：

| 路由 | 页面 |
| --- | --- |
| `#/` | 舞台，角色 + 聊天悬浮球 |
| `#/pet` | 网页桌宠 |
| `#/settings` | 设置，带“返回舞台”入口 |

共享层保留在 `src/character`、`src/llm`、`src/config`、`src/ui`、`src/speech`、
`src/memory`、`src/mcp`、`src/image` 等目录。设置子路由抽成
[settings-routes.tsx](src/ui/pages/settings/settings-routes.tsx)，网页与桌面各自
套不同的外层布局。

## 桌面版

### 窗口模型

- **桌宠窗口**：透明、无边框、置顶。窗口就是角色的相框，角色缩放通过调整窗口
  大小实现，默认画布 640x360，缩放范围 0.4～3 倍。
- **聊天窗口**：普通带边框窗口，460x680，Windows 11 下使用 Acrylic 背景材质。
- **聊天悬浮球**：64x64 透明置顶窗口，不占任务栏。左键拖动移动球窗口，
  位移不足 3px 视为点击，切换聊天窗口的打开/收起。
- **设置窗口**：普通带边框窗口，1080x740，桌面版没有“返回舞台”。

聊天窗和设置窗都各自记住位置与大小；悬浮球位置也写入窗口状态。

### 交互

- 左键拖动角色移动窗口；松手速度超过阈值时窗口惯性滑动，碰到工作区边缘反弹。
- 角色透明区域点击穿透到桌面，鼠标只在角色轮廓内命中。
- 右键角色：聊天、设置、隐藏桌宠。
- 托盘单击显示/隐藏桌宠；托盘菜单包含聊天、设置、鼠标穿透、置顶、关闭进托盘、
  重新加载与退出。
- 全局快捷键：
  - `Ctrl+Shift+P`：显示 / 隐藏桌宠。
  - `Ctrl+Shift+L`：切换鼠标穿透。
- 关闭桌宠默认进托盘（`closeToTray`），只有托盘退出才真正结束进程。
- Electron 默认菜单栏（File / Edit / View / Window / Help）已移除。

### 用户配置目录

桌面版用户配置固定放在 `%USERPROFILE%\.aipet`，不再使用 `%APPDATA%\aipets`，
也不做旧目录迁移：

```text
%USERPROFILE%\.aipet\
├─ Local Storage\           Chromium localStorage，存放 aipets:* 配置
├─ window-state.json        桌宠、聊天、设置、悬浮球的位置与大小
├─ desktop-preferences.json 关闭进托盘等桌面偏好
├─ plugins\                 本地插件目录
└─ plugins-state.json       插件启停状态
```

### 打包

[electron-builder.config.cjs](electron-builder.config.cjs) 同时输出：

- `nsis`：安装包，安装后从开始菜单或桌面快捷方式启动。
- `portable`：`release/aipets.exe`，便携单文件，双击即可运行。

打包时 [electron-builder.config.cjs](electron-builder.config.cjs) 用 `extraResources`
把 `assets/characters` 复制到产物的 `resources/characters`，不进 asar，NSIS 与
portable 两个目标都会带上完整素材。

打包后渲染层通过 `file://` 加载 `dist/desktop.html`；角色视频由主进程启动的
本地 HTTP 服务提供，并支持 Range 请求，保证视频循环播放。

## 网页版

- 舞台页是主入口：角色居中，右下角常驻聊天悬浮球，顶部有“桌宠模式”和“设置”。
- 聊天悬浮球常驻、可拖动、位置写入 `localStorage` 的 `aipets:chat-ball`；
  点击展开聊天浮层，浮层尽量贴在球的上/下/右/左且不遮挡球。
- 舞台页支持麦克风或音频文件的节拍检测，显示拍数与 BPM。
- 舞台页包含临时调试面板，展示导演模型、最近计划、舞台视频与环境编排明细。
- 网页里角色缩放与镜像用 CSS 变换；桌面端缩放通过主进程调整窗口尺寸。
- 多个标签页之间通过 `BroadcastChannel` 同步说话、回合、表演与环境编排事件。
- 静态部署时需要把 `assets/characters` 挂到 `/characters` 路径；
  `dev` 与 `preview` 已由 Vite 插件处理。

## 角色资源与动画

`assets/characters/characters.config.json` 是资源索引的唯一入口，
由 zod 校验，包含五个角色：

| id | 名称 | 定位 |
| --- | --- | --- |
| `main` | 蓝毛小女仆 | 温柔 · 俏皮 |
| `character2` | 橙毛大小姐 | 优雅 · 傲娇 |
| `character3` | 黄毛该溜子 | 活泼 · 大方 |
| `character4` | 白毛小龙娘 | 温柔 · 逞强 |
| `character5` | 黑毛小狐狸 | 狡黠 · 分寸 |

每个角色包含：

- 元信息：名称、英文名、定位、强调色、画布尺寸、淡入时长、人设。
- 五个状态片段：`idle`、`speaking`、`thinking`、`petted`、`dragging`。
- 两个播放池：`emotion`（情绪片段）与 `actions`（动作片段）。

片段可以是一个文件 `src`，也可以是 `segments` 数组。长动作在资源里拆成
`start / loop / end` 三段，运行时按 `start → loop*n → end` 连续播放。

播放器使用双 `<video>` 交叉淡入：新片段先在隐藏层预加载，可播放后切前台并淡入，
旧片段淡出，避免黑屏闪烁。片段解码失败时跳过该片段并保留当前画面。

资源变化后重建索引：

```sh
npm run characters
```

源目录默认是原工程 `apps/stage-web-react/dist/character-assets`，可用
`AIPETS_CHARACTER_SOURCE` 覆盖；已复制过资源时用 `AIPETS_SKIP_COPY=1` 只重建索引。

## LLM 动画导演

导演负责“这一轮该做什么动作”，不替代规则状态机。代码不写“几点必须睡觉”这类
判断，只把状态事实和影响提示写进提示词，由模型选片。

### 启用条件

- 设置页“动画”里配置导演模型。
- 导演模型留空时自动跟随当前对话模型。
- 两者都为空时保持规则导演。

### 状态提供者

内置四类状态，按“事实 + 动作提示”注入提示词：

- 世界状态：当前时间、天气（IP 定位 + Open-Meteo）。
- 角色状态：好感度（0～100，初始 50）、当前电量。

好感度由对话 Agent 的内置工具 `update_affinity` 更新，导演只读取。
新增状态类型时注册新的提供者即可，不改导演逻辑。

### 对话表演

模型返回：

```json
{
  "clips": ["开心跃动", { "name": "悠闲哼歌", "durationMs": 60000 }],
  "reason": "..."
}
```

- 只校验片段名是否存在，不限制数量、顺序和时长。
- 短片播放一次；长动作 `start → loop 循环 durationMs → end`。
- `durationMs` 不填时，长动作默认保持 60000 毫秒。
- 播放顺序完全按数组顺序。
- 点击与拖拽不打断当前表演；只有新一轮消息开始才取消。
- 导演请求超时 20 秒；失败、空计划或非法片段名时继续规则导演。

### 环境编排

- 回复结束后启动计时，尝试生成一段以约 24 小时为期望的动作序列。
  **当前代码中的等待时间是 30 秒，属于测试值；设计值为 90 秒**
  （`src/ui/components/character-stage.tsx` 的 `AMBIENT_REPLY_DELAY_MS`）。
- 计时期间点击、拖拽不重置；新回合立即取消计时。
- 模型输出与对话导演同形的平铺 `clips`：

```json
{
  "clips": [
    "东张西望",
    { "name": "悠闲哼歌", "durationMs": 43200000 },
    { "name": "写代码", "durationMs": 43200000 }
  ],
  "reason": "白天哼歌，晚上写代码"
}
```

- “约 24 小时”只写在提示词里，代码不限制动作数量、顺序和时长，也不校验总时长。
- 短片不计时；只累计长动作的 `durationMs`。
- 序列播完回到第一个动作，持续循环。
- 成功时替换并保存；失败时保留上一份编排；首次成功前使用规则导演。
- 编排按实例独立保存到 `aipets:ambient`，刷新后按 `generatedAt` 定位当前动作。
- 点击、拖拽时暂停保持；反应结束后恢复。
- 目前只有带 `start-loop-end` 长动作素材的角色参与环境编排（当前是 `main`）。

## 对话链路

1. `src/llm/client.ts` 按当前提供商与模型构建 `ChatOpenAI`。
2. `src/llm/agent.ts` 用 LangChain `createAgent` 组装人设、长期记忆、配方与工具，
   并挂 `summarizationMiddleware`，消息数超过阈值时压缩并保留最近 8 条。
3. `src/llm/chat-service.ts` 以流式方式调用 Agent；流式在产出内容前失败时，
   自动回退一次性调用。
4. 工具：`web_search`（Tavily）、`home_assistant_states`、`propose_recipe`、
   `update_affinity`，以及设置页启用的 MCP 工具。
5. 回复完成后并行执行：
   - 保存助手消息与工具卡片；
   - 按概率追加贴纸；
   - 后台提取长期记忆；
   - 请求动画导演表演计划；
   - 按配置朗读回复。
6. 朗读结束（或未启用朗读）时发出 `reply-ended`，启动环境编排计时。
7. 任何一轮新消息开始都会发出 `turn-started`，取消旧表演、环境编排与计时。

事件在桌面版走 Electron IPC，在网页版走 `BroadcastChannel`，同页监听优先直达。

## 语音

- 朗读引擎：
  - `provider`：调用 OpenAI 兼容的 `/audio/speech`。
  - `local`：使用系统 `speechSynthesis`。
  - 接口失败或环境不支持时自动退回系统语音。
- 输出设备可指定；不支持时退回默认设备。
- 识别方式（`hearing.mode`）：
  - `local`：本地识别（桌面外壳通常没有本地实现）。
  - `provider`：接口转写。
  - `omni`：用对话模型转写。
  - `auto`：优先本地，本地不可用时走接口转写。
- 另有唤醒词、声纹开关、转写与改写模型配置。

## 设置页

侧栏只放顶层入口：

- 角色：角色卡 / 数据 / 模型 / 动画 / 模型提供商
- 模块：语音、意识、视觉、记忆、表达、连接等二级页
- 连接：事件中继服务地址
- 桌面：桌面设置（窗口与托盘、电池、屏幕捕获、语音监测）与插件
- 系统：主题与运行环境

模块首页按分类进入：对话、语音、表达、记忆、连接。旧设置路径保留重定向。

桌面版设置页不显示“返回舞台”，因为桌面版没有舞台。

## 配置与存储

### 前端配置

每个域独立持久化到 `localStorage`，键名 `aipets:<域>`：

`affinity`、`ambient`、`animation`、`beatSync`、`card`、`character`、`chat`、
`connection`、`desktop`、`hearing`、`homeAssistant`、`image`、`mcp`、`memory`、
`models`、`providers`、`recipes`、`sessions`、`speech`、`stickers`、`toolCards`、
`ui`、`vision`、`weather`、`webSearch`。

网页版聊天悬浮球的位置额外使用 `aipets:chat-ball`。

桌面版这些键位于 `%USERPROFILE%\.aipet\Local Storage`；网页版位于浏览器自己的
`localStorage`。

### 主进程配置

- `window-state.json`：`pets` 与 `windows`（chat / settings / ball）的位置和大小。
- `desktop-preferences.json`：例如 `closeToTray`。
- `plugins-state.json`：插件启停状态。

### 数据管理

设置页“数据”支持：

- 导出 / 导入聊天记录 JSON；
- 清空聊天记录；
- 重置模型提供商；
- 清空全部 `aipets:` 前缀配置。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `AIPETS_URL` | 覆盖 Electron 开发时加载的 Vite 地址 |
| `AIPETS_CHARACTER_SOURCE` | 角色资源重建时的源目录 |
| `AIPETS_SKIP_COPY` | 设为 `1` 时只重建索引，不复制视频 |

## 测试与验证

```sh
npm run test
npm run lint
npm run build
```

当前单元测试覆盖：

- 状态机与情绪、手势识别；
- 片段选择、长动作执行、环境编排解析与定位；
- 角色索引解析与命中区域；
- MCP JSON Schema。

共 9 个测试文件、69 项测试。

桌面版建议手动验证：

1. 拖动角色时窗口尺寸保持不变（Windows 150% 缩放下曾经出现过窗口随拖动变大的问题）。
2. 角色轮廓外点击穿透到桌面。
3. 托盘显示/隐藏、置顶、鼠标穿透、关闭进托盘。
4. 右键菜单能打开聊天和设置。
5. 聊天悬浮球可拖动、点击能开关聊天窗口，重启后位置恢复。
6. 设置页没有“返回舞台”，窗口顶部没有 Electron 默认菜单栏。
7. 打包版双击 `release/aipets.exe` 能独立运行。

## 已知限制与注意

- 桌面端目前只面向 Windows；打包目标为 NSIS 与 portable。
- 环境编排只有带长动作素材的角色生效，其余角色继续规则导演。
- 环境编排等待时间当前为 30 秒测试值，正式设计为 90 秒。
- 天气依赖网络：ipinfo 为主定位、ipwho 为备用；失败后至少 1 分钟再重试，
  成功缓存 30 分钟。
- 桌面开发版（`http://`）与打包版（`file://`）的 localStorage 属于不同源，
  即使共用 `.aipet` 目录，配置也不会自动互相同步。
- 角色资源较大，NSIS 安装包体积明显大于便携版；便携版约 90 MB。
- 舞台页的调试面板是临时排查工具，后续可移除。
- 网页静态部署必须自行提供 `/characters/*` 静态资源。

## 相关文档

- [REWRITE_PLAN.md](REWRITE_PLAN.md)：整体重写计划与阶段进度。
- [LLM_DIRECTOR_PLAN.md](LLM_DIRECTOR_PLAN.md)：LLM 导演、状态提供者与环境编排设计。
- [DESKTOP_WEB_SPLIT_PLAN.md](DESKTOP_WEB_SPLIT_PLAN.md)：桌面版与网页版拆分计划。
