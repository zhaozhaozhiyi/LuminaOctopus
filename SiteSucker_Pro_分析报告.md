# SiteSucker Pro for Mac 深度分析报告

> 修订说明：本文基于 Rick's Apps 官网、6.1 手册、版本历史和 Mac App Store 公开信息整理；时间基准为 2026 年 3 月 11 日。

## 一、产品概述

**SiteSucker Pro** 是 Rick Cranisky 开发的 macOS 网站下载工具 **SiteSucker** 的增强版。它的核心能力是把网站中的网页、样式表、图片、PDF 与其他已发现资源下载到本地，并尽量保持目录结构与离线可浏览性。

| 项目 | 详情 |
|------|------|
| 产品名称 | SiteSucker Pro |
| 开发商 | Rick Cranisky（Rick's Apps） |
| 当前版本 | 6.1.5 |
| 系统要求 | macOS 12 Monterey 或更高版本 |
| 架构 | Universal App（Intel + Apple silicon） |
| 分发方式 | 官网下载 DMG，应用内注册 / FastSpring 购买 |
| 试用策略 | 14 天试用；试用期每次最多下载 100 个文件 |
| 官方网站 | https://ricks-apps.com/osx/sitesucker/ |

## 二、产品定位与版本差异

SiteSucker Pro 不是“免费普通版的解锁包”，而是 **官网直售的增强版本**。普通版 `SiteSucker` 通过 Mac App Store 单独销售，Pro 版则提供官网试用与注册。

| 能力 | SiteSucker | SiteSucker Pro |
|------|------------|----------------|
| 基础网站下载 | ✅ | ✅ |
| 本地化离线浏览 | ✅ | ✅ |
| 保存下载文档 / 断点恢复 | ✅ | ✅ |
| 隐藏 Web View 下载 HTML | ✅ | ✅ |
| 下载为 PDF | ✅ | ✅ |
| 嵌入式视频下载 | ❌ | ✅ |
| Tor 网络网站下载 | ❌ | ✅ |
| 视频分辨率偏好设置 | ❌ | ✅ |
| 视频媒体类型过滤 | ❌ | ✅ |

## 三、核心能力

### 3.1 基础下载能力

- 异步下载网站资源，并复制原站目录结构。
- 默认会对已下载网页做 **localize** 处理，把可替换的在线链接改写为本地文件链接，便于离线浏览。
- 可将下载任务和设置保存为文档；暂停后重新打开文档可继续下载。
- 可在下载网页时使用隐藏 `Web View`，改善部分 JavaScript 构建页面的抓取结果。
- 可将网站导出为 PDF；网页会被渲染进 PDF，内部链接会尽量指向文档内相应位置。

### 3.2 Pro 版增强能力

- 下载嵌入式视频，包括嵌入式 **YouTube、Vimeo、WordPress、Wistia** 视频。
- 支持 Tor 网络中的 `.onion` 站点。
- 可设置下载视频的首选分辨率。

### 3.3 自动化与辅助能力

- 支持 AppleScript 自动化。
- 提供 Automator 的 `Download Sites` action，可用于周期性任务。
- 支持 Suggested Settings，可在识别到常见抓取障碍时推荐一组更合适的设置。

## 四、下载机制与可解析范围

### 4.1 默认解析方式

官方文档明确说明：**SiteSucker 默认只检查 CSS 和 HTML 文件中的 URL**。  
分析 HTML 时，会读取 `style` 属性以及以下标签中的 URL：

`a`、`area`、`audio`、`base`、`body`、`embed`、`form`、`frame`、`iframe`、`img`、`input`、`link`、`meta`、`object`、`script`、`source`、`style`、`table`、`tbody`、`td`、`tfoot`、`th`、`thead`、`tr`、`track`、`video`

这意味着它不是“浏览器级 DOM 执行器”，更像是带有规则系统的 **静态资源镜像工具**。

### 4.2 URL 发现能力

除默认 HTML/CSS 扫描外，6.1 手册还表明它可以通过以下机制扩大发现范围：

- **Scan Sitemaps for URLs**：扫描 sitemap 中的 URL
- **Scan Comments for URLs**：扫描 HTML 注释中的 URL
- **Custom Data Attributes**：扫描指定的 `data-*` 属性
- **Patterns**：用正则表达式提取、包含、排除或替换 HTML 文本中的 URL
- **Download Using Web Views**：用隐藏 Web View 加载网页后再提取 HTML

### 4.3 文件类型控制

SiteSucker 的文件类型控制是基于 **MIME / media type**，而不是简单靠扩展名猜测：

- `HTML` 和 `CSS` 会始终下载并参与解析
- 其他资源可设置为允许全部、仅允许指定类型、或禁止指定类型
- 可单独配置哪些 media type 应被当作 HTML 继续扫描
- 可通过 `Media Type Replacement` 修正服务器错误返回的媒体类型

## 五、关键配置项

### 5.1 Request 设置

| 设置项 | 作用 |
|--------|------|
| Identity | 自定义 User-Agent，可伪装为常见浏览器或 Web View |
| Attempts | 网络错误时的重试次数 |
| Timeout | 请求超时 |
| Delay / Delay Range | 控制请求间隔与随机化延时 |
| Domains to Delay | 指定哪些域名受延时策略影响 |

### 5.2 URL 设置

| 设置项 | 作用 |
|--------|------|
| URL Constraint | 限定抓取范围，如 Host、Subdomains、Directory |
| Include / Exclude URL | 用字符串或正则控制允许 / 排除 URL |
| Check All Links | 把 HTML 中所有链接都作为检查目标 |
| Scan Sitemaps for URLs | 扫描 sitemap |
| Scan Comments for URLs | 扫描 HTML 注释 |
| Treat Ambiguous URLs as Folders | 改变无扩展名 URL 的本地路径映射 |
| Download Links in PDFs | 可尝试跟随 PDF 中的链接下载目标文件 |

### 5.3 Limit 设置

| 设置项 | 作用 |
|--------|------|
| Maximum Number of Levels | 限制抓取深度 |
| Maximum Number of Files | 限制最大下载文件数 |
| Minimum / Maximum File Size | 限制非 HTML / CSS 文件大小 |
| Minimum Image Size | 下载后删除过小图片 |

### 5.4 Webpage / General 设置

| 设置项 | 作用 |
|--------|------|
| Download Using Web Views | 用隐藏 Web View 下载 HTML |
| Create PDF | 以 PDF 形式保存网站 |
| Save Delay | 给 JavaScript 生成内容额外渲染时间 |
| Patterns | 通过正则修正页面、提取 URL、重试损坏页面 |
| Include Supporting Files | 强制包含跨域样式、图片、字体、视频等支撑资源 |
| Ignore Robot Exclusions | 忽略 robots / META robots / X-Robots-Tag |
| Ignore rel="nofollow" | 跟随 `nofollow` 链接 |

## 六、真实技术边界

### 6.1 官方边界与实际影响

| 边界 | 官方描述 | 实际影响 |
|------|----------|----------|
| JavaScript | 默认解析器**完全忽略** JavaScript 中的 URL | 纯前端路由、运行时拼接链接、接口返回页面列表时，抓取结果通常不完整 |
| 动态页面 | 可通过隐藏 Web View 改善部分 JS 页面结果 | 只能提升“首屏 HTML 提取”能力，不等于完整浏览器自动化 |
| 表单 | 默认只会下载 `form action` 和 `input src`，大多数表单逻辑不会被自动执行 | 搜索、分页、登录后的复杂交互站点仍需手工辅助 |
| 登录站点 | 可用内置浏览器登录；支持 Password AutoFill 和 HTTP Basic 登录对话框 | 对“需要登录”的站点并非完全无能，但复杂会话流仍不稳定 |
| 视频 | 普通版不能下载视频；Pro 版支持嵌入式视频 | 更适合“网页里嵌入的视频”，不适合完整视频平台镜像 |
| robots | 默认遵守 robots / META robots / X-Robots-Tag | 对受限站点更保守，抓取范围可能小于预期 |
| 大站点 | 官方明确提示可能耗尽内存、磁盘或受文件系统限制 | 超大站点抓取需严格配置深度、数量和文件大小限制 |

### 6.2 关于 PDF 的保守结论

官方公开资料在 PDF 上存在两层表述：

- 官网 `Limitations` 页写的是：**不会扫描 PDF、Flash、mov 等媒体里的嵌入链接**
- 6.1 手册 `URL` 设置里又提供了 **Download Links in PDFs** 选项，并明确说明 **PDF 本身不会被本地化**

因此，更稳妥的结论是：

> **PDF 不是 SiteSucker 的一等解析对象。即使开启 PDF 链接相关选项，也应把它理解为“有限跟随 PDF 中的链接”，而不是像 HTML/CSS 一样完整解析和本地化。**

### 6.3 对现代前端站点的适配判断

对于 React、Vue、Angular、Next.js App Router、Nuxt、SaaS 控制台这类现代前端站点，SiteSucker Pro 的能力边界应理解为：

- 对 **服务端已输出主要内容** 的页面，通常还能抓到可用结果
- 对 **首屏依赖 JavaScript 渲染** 的页面，可尝试 `Download Using Web Views`
- 对 **依赖前端路由、API 请求、登录态、惰性加载、无限滚动、运行时状态** 的应用，离线效果通常不可靠

所以它更接近：

- 文档镜像工具
- 网站快照 / 视觉备份工具
- 中轻度规则化抓取工具

而不是：

- 完整浏览器自动化爬虫
- 现代 Web App 归档引擎

## 七、适用场景与不适用场景

### 7.1 适用场景

| 场景 | 适配度 | 说明 |
|------|--------|------|
| 技术文档 / 帮助中心离线阅读 | 高 | 这类站点通常结构清晰、静态资源明确 |
| 中小型企业官网归档 | 高 | 适合做内容和样式快照 |
| 老旧 CMS / 传统服务端渲染网站迁移前备份 | 高 | 对静态页面和资源抓取较稳 |
| 课程网站 / 教程站点保存 | 中高 | Pro 版对嵌入视频更有价值 |
| 需登录但结构简单的后台 / 内网 | 中 | 可借助内置浏览器登录后下载 |
| archive.org 页面抓取 | 中 | 6.1 提供专门的 Suggested Settings |

### 7.2 不适用场景

| 场景 | 原因 |
|------|------|
| 现代 SPA / PWA 应用完整备份 | 依赖 JavaScript 运行时与 API 状态 |
| 强交互型 SaaS 控制台 | 离线后大部分功能无法复现 |
| 复杂登录、多步 MFA、单点登录站点 | 会话与脚本流程复杂，超出其强项 |
| 完整视频平台镜像 | Pro 支持的是网页嵌入视频，不是整个平台抓取 |
| 合规级网页取证 / 法证归档 | 缺少浏览器行为回放与更严格的归档保证 |

## 八、定价与许可

### 8.1 当前公开信息

| 产品 | 渠道 | 价格 / 许可信息 |
|------|------|------------------|
| SiteSucker | Mac App Store | 一次性付费，当前公开价为 **US$5.99** |
| SiteSucker Pro | 官网 / FastSpring | 14 天试用；试用期每次最多下载 100 个文件；正式价格以购买页为准 |

### 8.2 许可理解

- Pro 版通过注册窗口或 FastSpring 商店购买
- 官方提供 EULA
- 从公开信息看，它更像个人用户和专业个人工作流工具，而不是团队协作型 SaaS

## 九、综合结论

### 9.1 优势

1. **原生 macOS 体验成熟**：轻量、直接、上手成本低。
2. **规则系统够强**：URL 约束、Patterns、媒体类型替换、延时与重试都很实用。
3. **对“静态或半静态网站”非常有效**：文档站、传统 CMS、内容站、品牌站是它的强项。
4. **Pro 版补上了嵌入视频和 Tor**：对教育内容保存和特殊网络场景更有价值。
5. **不是纯黑盒**：有手册、Suggested Settings、AppleScript、Automator，适合长期使用。

### 9.2 劣势

1. **不是浏览器自动化工具**：默认对 JavaScript 非常保守。
2. **对现代 Web App 适配有限**：即使启用 Web View，也很难完整复刻交互行为。
3. **PDF / 媒体链接支持边界不够直观**：官方不同页面的表述存在差异。
4. **仅限 macOS**：跨平台团队不方便统一工具链。

### 9.3 最终判断

如果目标是：

- 离线阅读文档
- 保存网站内容快照
- 迁移前做资源镜像
- 下载传统站点或以服务端渲染为主的网站

那么 **SiteSucker Pro 是一款非常靠谱的 Mac 原生工具**。

如果目标是：

- 完整备份现代 SPA
- 抓取复杂登录态系统
- 还原在线交互逻辑
- 做高保真自动化归档

那么应优先考虑 **Playwright / Puppeteer / 定制爬虫 / 专业归档服务**，而不是把 SiteSucker Pro 当成浏览器自动化替代品。

## 十、参考资源

- 官方网站：https://ricks-apps.com/osx/sitesucker/
- 官网限制说明：https://ricks-apps.com/osx/sitesucker/limitations.html
- 版本历史：https://ricks-apps.com/osx/sitesucker/history.html
- 6.1 手册总入口：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/index.html
- 6.1 手册 `Overview`：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/pgs/Overview.html
- 6.1 手册 `Limitations`：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/pgs/Limitations.html
- 6.1 手册 `Request`：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/pgs/Request.html
- 6.1 手册 `URL`：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/pgs/URL.html
- 6.1 手册 `Webpage`：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/pgs/Webpage.html![1773211958919](image/SiteSucker_Pro_分析报告/1773211958919.png)![1773211959647](image/SiteSucker_Pro_分析报告/1773211959647.png)![1773211959772](image/SiteSucker_Pro_分析报告/1773211959772.png)![1773211959917](image/SiteSucker_Pro_分析报告/1773211959917.png)![1773211961925](image/SiteSucker_Pro_分析报告/1773211961925.png)![1773211962279](image/SiteSucker_Pro_分析报告/1773211962279.png)![1773211962415](image/SiteSucker_Pro_分析报告/1773211962415.png)
- 6.1 手册 `File Type`：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/pgs/FileType.html
- 6.1 手册 `Limit`：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/pgs/Limit.html
- 6.1 手册 `Password-protected Sites`：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/pgs/ProtectedSites.html
- Suggested Settings：https://ricks-apps.com/osx/sitesucker/archive/6.x/6.1.x/6.1/manuals/en/pgs/SuggestedSettings.html
- AppleScripts：https://ricks-apps.com/osx/sitesucker/scripts.html
- Mac App Store（SiteSucker）：https://apps.apple.com/us/app/sitesucker/id442168834?mt=12

---

*报告更新时间：2026 年 3 月 11 日*  
*结论原则：以官方公开资料为准；对官方表述不一致之处，采用保守解释。*
