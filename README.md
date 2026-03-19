# LuminaOctopus（拾光章鱼）

把网站抓取为**可离线浏览的站点快照**：支持深度控制、暂停/恢复/停止与实时队列状态。当前先提供 Web 版，后续演进为 Tauri 2 桌面端以获得更自然的“选择目录落盘”等系统能力。

> 一句话定位：Turn websites into offline-browsable snapshots—with pause/resume, job history, and export.

## 主要特性

- **离线可用**：抓取 HTML 与关键资源并做必要改写，形成可离线打开的站点镜像
- **可控**：深度（level/depth）、同站点限制（same-site）、并发与延迟（礼貌抓取）
- **可恢复（进行中）**：按 job 维度落盘、历史任务回看/导出（见 Roadmap）
- **可演进**：爬虫引擎为纯 Node 模块，便于在桌面端复用（先用 sidecar 进程承载，后续可迁移到 Rust）

## 快速开始

### 环境要求

- **Node.js**：建议使用较新的 LTS 版本
- **npm**：随 Node 安装

### 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`，输入目标 URL、选择抓取层级后点击「开始抓取」。

## 技术栈与架构

- **Web**：Next.js 14（App Router）+ React + TypeScript
- **爬虫核心**：`lib/crawler/` 纯 Node 实现（队列、去重、解析与保存），无 Next/React 依赖
- **状态存储**：`lib/crawler-store.ts` 单例存储（Web 版供 API 与前端轮询）；桌面端改为本地进程单例 + 前端桥接

## 桌面端技术方案（Tauri 2，全局约束）

目标平台：**Windows + macOS**。约束：**复用 Next.js/React**、**安装包体积尽量小**、**不需要自动更新**。

- **壳**：Tauri 2（系统 WebView：Windows WebView2 / macOS WKWebView）
- **前端**：复用现有 Next.js/React UI，桌面端以“静态资源加载”为主（避免在桌面壳里跑 Next server）
- **爬虫运行方式（默认先落地 A）**
  - A. **Node sidecar 进程**：Tauri 启动/管理本地 Node 进程运行 `lib/crawler/`，通过本地 IPC/HTTP 与前端通信（迁移成本低）
  - B. **Rust 原生引擎**：逐步把爬虫核心迁移到 Rust（体积与资源占用更优、部署更简单，改造成本更高）
- **系统能力**：选择保存目录、打开结果目录、落盘写文件（不做 auto-update）

## 目录结构

```text
├── app/                    # Next 页面与 API
│   ├── api/crawl/          # start, status, stop, pause, resume
│   ├── layout.tsx
│   ├── page.tsx            # 主界面
│   └── globals.css
├── lib/
│   ├── crawler/            # 纯 Node 爬虫引擎（桌面端可复用）
│   │   ├── engine.ts
│   │   ├── types.ts
│   │   ├── url-utils.ts
│   │   └── index.ts
│   └── crawler-store.ts    # 单例状态（Web 版）；桌面端会替换为桥接层
├── docs/                   # PRD/设计/品牌等文档
├── package.json
└── README.md
```

## Roadmap（按 `docs/PRD.md`）

- **Phase 1（已具备 / 稳定化）**
  - URL 输入与规范化、深度控制
  - 开始 / 暂停 / 恢复 / 停止
  - 实时队列与汇总统计
  - 同站点限制（后续会把更多选项完善成设置面板）
- **Phase 2（优先）**
  - Jobs 历史列表（按 `jobId` 切换查看）
  - 按 `jobId` 导出 zip（从落盘导出，支持跨刷新/重启）
  - 基础日志（按级别筛选）
- **Phase 3**
  - 单条 Skip、列表筛选/搜索
  - 离线预览（严格限制在 `jobs/<jobId>/site/`）
- **Phase 5（规划）**
  - Tauri 2 桌面端：选择保存目录、打开结果目录、桌面端本地运行引擎并通过桥接同步

## 边界与合规提示

- **不承诺**复杂 SPA、强交互、复杂登录/MFA 的完整离线复现（当前不做浏览器自动化爬虫）。
- 抓取与使用内容请确保**有权访问与使用**；建议遵守 robots 等站点策略，合理设置并发与延迟。


## License

尚未添加许可证文件（如果你准备开源发布，建议补充 `LICENSE` 并在这里标注类型）。
