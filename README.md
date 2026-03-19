# Lumina Octopus

网站抓取 / 整站镜像 Web 应用。先以 Web 形式运行，后续可用 Electron 打包为桌面端。

## 技术栈

- **Next.js 14**（App Router）+ React + TypeScript
- **爬虫核心**：`lib/crawler/` 纯 Node 实现（cheerio 解析、队列、去重），无 Next/React 依赖，便于 Electron 主进程复用
- **状态**：`lib/crawler-store.ts` 单例存储，供 API 与前端轮询；Electron 版可改为 main 进程内单例 + IPC

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)，输入目标 URL、选择层级后点击「开始抓取」。

## 功能

- 输入 URL，按层级抓取（Level 0 仅当前页，逐级加深）
- 仅同域名链接（可配置）
- 开始 / 暂停 / 恢复 / 停止
- 实时状态与队列列表（状态、URL、进度、层级）

## 项目结构（便于后续 Electron 封装）

```
├── app/                    # Next 页面与 API
│   ├── api/crawl/          # start, status, stop, pause, resume
│   ├── layout.tsx
│   ├── page.tsx            # 主界面
│   └── globals.css
├── lib/
│   ├── crawler/            # 纯 Node 爬虫引擎（Electron 可直接 require）
│   │   ├── engine.ts
│   │   ├── types.ts
│   │   ├── url-utils.ts
│   │   └── index.ts
│   └── crawler-store.ts    # 单例状态，Web 用；Electron 可替换为 IPC
├── package.json
└── README.md
```

## 后续：Electron 封装

1. **安装 Electron**  
   `npm i -D electron electron-builder`（或 `electron-forge`）

2. **主进程**  
   - 创建 `electron/main.js`：`BrowserWindow` 加载 `http://localhost:3000`（开发）或打包后的 Next 静态/standalone 输出。
   - 爬虫逻辑：在主进程里 `require('./lib/crawler')` 使用同一套 `CrawlEngine`，不再走 Next API；状态通过 `ipcMain` / `ipcRenderer` 与渲染进程（当前 React 页面）同步。

3. **渲染进程**  
   - 现有 Next 页面不变，仅把 `fetch('/api/crawl/...')` 改为通过 `window.electronAPI` 或 `preload` 暴露的 IPC 调用（如 `invoke('crawl-start', { url, maxLevel })`），由主进程执行爬虫并回传状态。

4. **本地保存**  
   - 在 Electron 主进程里，用 `CrawlEngine#getDownloaded()` 拿到内容后，用 `fs` 写入用户选择的目录（如 `dialog.showOpenDialog` 选保存路径），或先打包为 zip 再保存。

5. **打包**  
   - Next 先 `npm run build`，Electron 加载 `file://.../out` 或 standalone 的 server；或开发时主进程直接打开 `http://localhost:3000`。

这样当前 Web 应用无需大改即可在 Electron 中复用 UI 与爬虫逻辑，仅把「谁跑爬虫、状态如何同步、结果存哪」从 Next API 换为主进程 + IPC + 本地文件。
