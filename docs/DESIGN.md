# Lumina Octopus 功能点与详细设计

基于参考产品（SiteSucker Pro）界面与交互，整理功能点并给出详细设计，便于 Web 版实现与后续 Electron 封装。

---

## 一、参考界面提炼（来自参考图）

| 区域 | 内容 | 说明 |
|------|------|------|
| 标题栏 | 应用名 | 窗口标题 |
| 菜单栏 | File, Edit, View, Control, Settings, History, Window, Help | 全局能力入口 |
| 工具栏 | History · Settings · Queue · Log · File · Finder · Download · Next · Pause · Stop | 核心操作与视图切换 |
| 项目名 | 文本输入 "Untitled" | 当前任务/项目名称 |
| 汇总区 | Level 0 · Files Downloaded 0 · Files Remaining 0 · Errors 0 | 当前任务统计 |
| 主表格 | 列：Status · URL or Path · Progress · Skip | 任务队列/列表，每行可跳过 |

---

## 二、功能点列表

### 2.1 核心抓取（MVP，已实现部分）

| 编号 | 功能点 | 描述 | 优先级 | 当前状态 |
|------|--------|------|--------|----------|
| F1 | 输入入口 URL | 用户输入要抓取的网站地址，支持校验与规范化 | P0 | ✅ 已实现 |
| F2 | 设置抓取层级 | Level 0～N，0=仅当前页，N=向下 N 层链接 | P0 | ✅ 已实现 |
| F3 | 开始抓取 | 一键启动，从入口 URL 按层级广度优先抓取 | P0 | ✅ 已实现 |
| F4 | 暂停 / 恢复 | 暂停后队列保留，可恢复继续 | P0 | ✅ 已实现 |
| F5 | 停止 | 终止当前任务，不再拉取新请求 | P0 | ✅ 已实现 |
| F6 | 实时队列列表 | 表格展示：状态、URL/路径、进度、层级 | P0 | ✅ 已实现 |
| F7 | 汇总统计 | 当前层级、已下载数、剩余数、错误数 | P0 | ✅ 已实现 |
| F8 | 同源/跨域控制 | 可选仅抓取同域名或允许外链（同源为默认） | P1 | ✅ 已实现（选项可再暴露到 UI） |

### 2.2 任务与项目管理（对齐参考图）

| 编号 | 功能点 | 描述 | 优先级 | 当前状态 |
|------|--------|------|--------|----------|
| F9 | 任务/项目名称 | 可为当前抓取任务命名（如参考图 "Untitled"） | P1 | ⬜ 待实现 |
| F10 | 历史记录 | 查看、选择并恢复历史任务（仅入口 URL + 参数快照或结果列表） | P1 | ⬜ 待实现 |
| F11 | 多任务/队列视图 | 可查看排队中的多个任务或历史任务列表 | P2 | ⬜ 待实现 |

### 2.3 列表与单条操作（对齐参考图）

| 编号 | 功能点 | 描述 | 优先级 | 当前状态 |
|------|--------|------|--------|----------|
| F12 | 单条跳过 (Skip) | 表格每行提供「跳过」按钮，将该 URL 从队列移除或标记为跳过 | P1 | ⬜ 待实现 |
| F13 | 状态列 | 展示每条：Idle / Pending / Downloading / Done / Error / Skipped | P0 | ✅ 已实现 |
| F14 | URL 或路径列 | 展示完整 URL 或本地相对路径，过长可省略与 tooltip | P0 | ✅ 已实现 |
| F15 | 进度列 | 每条 0～100% 或 indeterminate | P0 | ✅ 已实现 |

### 2.4 设置与行为（对齐参考图 Settings）

| 编号 | 功能点 | 描述 | 优先级 | 当前状态 |
|------|--------|------|--------|----------|
| F16 | 抓取设置 | 最大层级、并发数、请求间隔、同源开关、User-Agent 等 | P1 | ⬜ 部分在 API，UI 未暴露 |
| F17 | 保存路径（Electron） | 选择下载文件保存目录 | P1 | ⬜ 仅 Electron 版 |
| F18 | 文件类型过滤 | 仅抓取 HTML / 包含图片与 CSS / 全部资源 | P2 | ⬜ 待实现 |

### 2.5 日志与调试（对齐参考图 Log）

| 编号 | 功能点 | 描述 | 优先级 | 当前状态 |
|------|--------|------|--------|----------|
| F19 | 运行日志 | 按时间记录：请求 URL、状态码、错误信息、重试等 | P1 | ⬜ 待实现 |
| F20 | 日志视图切换 | 类似参考图 Log 入口，主界面与日志视图切换 | P2 | ⬜ 待实现 |

### 2.6 结果与导出（对齐参考图 File / Finder）

| 编号 | 功能点 | 描述 | 优先级 | 当前状态 |
|------|--------|------|--------|----------|
| F21 | 打开结果目录（Electron） | 在系统文件管理器中打开保存目录 | P1 | ⬜ 仅 Electron 版 |
| F22 | 导出为 Zip（Web） | 将已抓取文件打包为 zip 供下载 | P1 | ⬜ 待实现 |
| F23 | 预览已抓取页面 | 在应用内或新窗口打开本地 HTML 预览 | P2 | ⬜ 待实现 |

### 2.7 其他（参考图延伸）

| 编号 | 功能点 | 描述 | 优先级 | 当前状态 |
|------|--------|------|--------|----------|
| F24 | 请求头 / Cookie | 可选自定义 Header、Cookie 以支持需登录的站 | P2 | ⬜ 待实现 |
| F25 | robots.txt | 是否遵守目标站 robots.txt | P2 | ⬜ 待实现 |
| F26 | 授权/许可（可选） | 参考图有注册与试用，可按需做许可校验 | P3 | ⬜ 可选 |

---

## 三、详细设计

### 3.1 信息架构（IA）

```
Lumina Octopus
├── 主界面（当前页）
│   ├── 顶部：应用标题 + 项目名（可选）
│   ├── 控制区：URL 输入、层级、同源开关、[开始][暂停][恢复][停止]
│   ├── 汇总条：Level · 已下载 · 剩余 · 错误
│   └── 主表格：Status | URL/Path | Progress | Skip
├── 设置（弹窗或侧栏）
│   └── 层级 / 并发 / 间隔 / 同源 / User-Agent
├── 历史（列表 + 恢复）
│   └── 历史任务列表，点击恢复参数或结果
├── 日志（Tab 或独立视图）
│   └── 时间线日志列表
└── 导出/打开（Web：下载 Zip；Electron：选目录 + 打开文件夹）
```

### 3.2 页面布局与区域

- **顶部栏**  
  - 左侧：Logo + 应用名「Lumina Octopus」。  
  - 右侧（可选）：项目名称输入框（对应参考图 "Untitled"）、设置入口、历史入口。

- **控制区（Card）**  
  - 第一行：URL 输入框（必填）、层级下拉（0～5）、同源复选框。  
  - 第二行：按钮组 [开始抓取] [暂停] [恢复] [停止]，禁用态与当前状态联动。

- **汇总条**  
  - 单行多列：当前 Level、Files Downloaded、Files Remaining、Errors；数值实时更新。

- **主表格**  
  - 列：Status（Badge）、URL or Path（可截断 + title）、Progress（%）、Skip（图标按钮）。  
  - 行：每一条 `CrawlItem`，按加入顺序或按状态分组展示均可。  
  - 空态：无任务时提示「输入 URL 并点击开始抓取」。

### 3.3 数据模型（与现有类型对齐）

- **CrawlOptions**（已有，可扩展）  
  - `baseUrl`, `maxLevel`, `maxConcurrent`, `sameOriginOnly`, `delayMs`  
  - 扩展：`projectName?`, `userAgent?`, `respectRobots?`, `allowedTypes?`

- **CrawlItem**（已有）  
  - `url`, `status`, `progress`, `level`, `error?`  
  - 扩展（可选）：`localPath?`, `contentType?`, `skipped?: boolean`

- **CrawlState**（已有）  
  - `status`, `baseUrl`, `maxLevel`, `filesDownloaded`, `filesRemaining`, `errors`, `items`, `startedAt`, `stoppedAt`  
  - 扩展：`projectName?`, `logEntries?: LogEntry[]`

- **LogEntry**（新增，用于 F19）  
  - `timestamp`, `url`, `event`: 'request'|'success'|'error'|'skip', `message?`, `statusCode?`

### 3.4 状态机（抓取会话）

```
                    start()
  [idle] ──────────────────────────► [running]
     ▲                                    │
     │                                    │ pause()
     │                                    ▼
     │                              [paused]
     │                                    │
     │                                    │ resume()
     │                                    ▼
     │ stop() / done / error         [running]
     │                                    │
     └──────────────────────────────────┘
              (stopped / done / error)
```

- **idle**：无任务或任务已结束，可输入 URL 并「开始抓取」。  
- **running**：可「暂停」或「停止」；列表与汇总持续更新。  
- **paused**：可「恢复」或「停止」；队列保留。  
- **stopped / done / error**：回到可新建任务状态，可导出结果或查看日志。

### 3.5 API 设计（与现有实现对齐）

| 方法 | 路径 | 说明 | 请求体/响应 |
|------|------|------|-------------|
| POST | `/api/crawl/start` | 创建并启动任务 | Body: `{ url, maxLevel?, sameOriginOnly?, projectName? }` → 返回 `CrawlState` |
| GET  | `/api/crawl/status` | 轮询当前任务状态 | 返回 `CrawlState \| null` |
| POST | `/api/crawl/pause` | 暂停 | 返回当前 `CrawlState` |
| POST | `/api/crawl/resume` | 恢复 | 返回当前 `CrawlState` |
| POST | `/api/crawl/stop` | 停止 | 返回当前 `CrawlState` |
| POST | `/api/crawl/skip` | 跳过指定 URL（待实现） | Body: `{ url }` |
| GET  | `/api/crawl/export` | 导出 Zip（待实现） | 返回 zip 流或下载 URL |
| GET  | `/api/history` | 历史列表（待实现） | 返回 `{ items: HistoryItem[] }` |
| GET  | `/api/settings` | 获取设置（待实现） | 返回当前 CrawlOptions 默认值 |

### 3.6 爬虫引擎行为（与现有 engine 一致）

- **发现链接**：从 HTML 中解析 `<a href>`, `<link href>`, `<img src>`, `<script src>`，再通过 `resolveUrl` 转成绝对 URL。  
- **去重**：使用 `normalizeUrl` 后的 URL 进 Set，已存在则不再入队。  
- **层级**：仅对 `text/html` 响应继续解析并入队，且 `level < maxLevel`。  
- **并发与礼貌**：`maxConcurrent` 控制并发数，`delayMs` 控制请求间隔。  
- **存储**：当前为内存 Map（path → { contentType, body }）；Electron 版可改为写入用户选择目录，Web 版可在此基础上生成 Zip。

### 3.7 前端组件拆分建议（便于后续扩展）

- **CrawlToolbar**：URL 输入、层级、同源、开始/暂停/恢复/停止。  
- **SummaryBar**：Level、已下载、剩余、错误。  
- **CrawlTable**：表头 + 行组件 `CrawlRow`（Status、URL、Progress、Skip 按钮）。  
- **SettingsPanel**：弹窗或侧栏，表单对应 CrawlOptions。  
- **HistoryPanel**：历史任务列表 + 恢复。  
- **LogPanel**：按时间展示 LogEntry 列表。  

状态通过现有 `/api/crawl/status` 轮询或后续 WebSocket 推送即可，无需大改。

### 3.8 Electron 差异（简要）

- **主进程**：复用 `lib/crawler` 的 `CrawlEngine`，通过 IPC 暴露 start/stop/pause/resume/status；保存路径由 `dialog.showOpenDialog` 获取，用 `fs` 写文件。  
- **渲染进程**：同一套 React 页面，将 `fetch('/api/crawl/...')` 改为 `window.electronAPI.invoke('crawl-start', opts)` 等。  
- **仅 Electron 的能力**：选择保存目录、在 Finder/资源管理器中打开结果目录、可选系统托盘与离线运行。

---

## 四、实现优先级建议

1. **Phase 1（当前 + 小增强）**  
   - 保持现有 MVP，补充：单条 Skip（F12）、项目名（F9）、设置面板暴露部分选项（F16）。

2. **Phase 2**  
   - 导出 Zip（F22）、简单运行日志（F19）、历史记录列表与恢复（F10）。

3. **Phase 3**  
   - 日志视图切换（F20）、文件类型过滤（F18）、robots.txt（F25）、请求头/Cookie（F24）。

4. **Electron 封装**  
   - 在主进程接入 CrawlEngine、保存路径与打开文件夹（F17、F21），其余 UI 与 Web 共用。

以上功能点与详细设计可直接用于迭代开发与任务拆分；实现时以 `lib/crawler` 与现有 API 为基础扩展即可。
