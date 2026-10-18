# XDRemux 官网（单文件静态版）

XDRemux 的产品发布页：Apple 风格的黑白分段叙事 + 程序化生成的 HDR 视觉 + 滚动驱动的 HDR 转换故事。
整站是**一个 `index.html`**（内联 CSS / JS）+ 5 个图片资源，无构建步骤、无 npm 运行时依赖。

- 线上地址：<https://xdremux.app/>（Cloudflare 边缘代理 + GitHub Pages 内容源）
- 旧地址：`https://beetya.ng/xdremux/` 已改为 301 跳转到 `https://xdremux.app/`，不再作为入口
- 产品仓库：<https://github.com/BeetMan/XDRemux-Flutter>

## 目录结构

```
.
├── index.html          # 全部页面结构、样式、脚本（约 110 KB）
├── assets/
│   ├── icon.png        # favicon / 导航 / 页脚图标
│   ├── og.jpg          # 1200×630 社交分享图（tools/preview.mjs --og 生成）
│   ├── windows.webp    # 应用截图（Windows / macOS / Android / iOS）
│   ├── macos.webp
│   ├── android.webp
│   └── ios.webp
├── cloudflare/edge-proxy/
│   ├── wrangler.toml   # Worker `xdremux-app` + 自定义域名 xdremux.app / www.xdremux.app
│   └── index.js        # 12 行逻辑：www→apex、http→https、缓存反代 GitHub Pages
├── tools/
│   └── preview.mjs     # 零依赖无头 Chrome 截图 / 布局自检 / OG 生成
├── .github/workflows/
│   └── deploy-pages.yml # push main -> 发布到 GitHub Pages（内容源）
└── preview-checks/     # 本地生成的截图与报告（.gitignore，不提交）
```

## 本地预览

直接用浏览器打开 `index.html` 即可；建议起一个本地静态服务器（避免个别浏览器对 `file://` 的限制）：

```bash
npx serve .            # 或
python -m http.server 8000
```

## 自检 / 截图 / 分享图

需要本机安装 Chrome / Edge / Chromium，以及 Node 22+（使用内置 `fetch` 与 `WebSocket`，**无需 npm install**）。

```bash
node tools/preview.mjs          # 输出 preview-checks/*.png 与 report.json
node tools/preview.mjs --og     # 额外重新生成 assets/og.jpg
CHROME_PATH=/path/to/chrome node tools/preview.mjs   # 自定义浏览器路径
```

脚本会检查并打印：

- 首屏 CTA 是否在 1440×900 / 390×844 的第一屏内；
- 320 / 390 / 1024 / 1440 宽度下是否出现横向溢出；
- `prefers-reduced-motion: reduce` 下 HDR 叙事是否折叠为静态、图片是否居中；
- 页面标题 / description / canonical / OG / Twitter 元数据是否完整；
- 控制台是否有 JS 异常（GitHub API 的限流报错会被忽略）。

## 设计实现要点

- **零图片讲故事**：Hero 与 HDR 叙事里的黄昏场景由 `<canvas>` 程序化绘制，用同一份几何生成 `hdr` / `sdr` / `gain` 三套色板，再通过 CSS `clip-path` 擦拭做「同一张照片，不同设备观感」的对比；其余演示（摄影风格、人像景深、Live Photo、批量队列）全部是 CSS / SVG。
- **滚动叙事**：HDR 段是 `420vh` 的 sticky 舞台，滚动只写 CSS 自定义属性（`--s` / `--gain` / `--wipe`），不在滚动帧里读写布局；`prefers-reduced-motion` 下自动降级为「静态图 + 4 列文案」。
- **交互**：轮播自动播放 / 暂停 / 重播 / 进度圆点；输出模式自动切换、用户点过即停；风格盘与光圈滑杆、按住播放实况；App 截图 Tab 支持方向键；导航随浅色章节自动反色。
- **版本与下载**：内置 v0.4.3 的静态下载链接作为兜底，页面加载后尝试请求 GitHub Releases API 更新到最新版；请求失败时保持兜底链接。按 UA 识别平台，把 Hero 按钮换成对应安装包并把下载卡片标记为「当前设备」。

## 2026-10-18 审查后的修改

以审查快照为基线（见 git 历史第一个 commit），这一版做了：

1. **首屏 CTA 上移**：Hero 主按钮与「免费下载 / MIT」说明移到示意图上方。原版在 1440×900 下 CTA 位于 1171px（折叠线以下 271px），1280×800 下更靠下；现在 1440×900 位于 428px、390×844 位于 315px，均在第一屏内。
2. **对比度**：往返工作流卡片里的「第 N 步」由 `#86868b` 改为 `#6e6e73`，在 `#f5f5f7` 上的对比度从 3.33:1 提升到 4.66:1（WCAG AA）。
3. **轮播圆点触控区**：`::before` 命中区从 20×32px 扩大到 26×44px，并加大圆点间距。
4. **减弱动态修复**：`prefers-reduced-motion` 下 HDR 叙事图固定为 1152×720 并居中（原先左对齐、右侧留 288px 黑边），文案网格与图片对齐。
5. **桌面截图舞台**：Windows / macOS 截图在 ≥735px 时放到深色圆角底板上，解决浅色界面叠浅灰背景「白上白」的问题；手机上仍保持无底板的轻量呈现。
6. **分享信息**：`<title>`、Open Graph、Twitter Card 补全，新增 1200×630 `assets/og.jpg`（由 `tools/preview.mjs --og` 生成）。

## 部署架构

```
GitHub Actions (push main) → GitHub Pages (内容源)
                               ↓ 缓存反代
Cloudflare Worker `xdremux-app`（自定义域名 xdremux.app / www.xdremux.app）
                               ↓
                    https://xdremux.app/  (Cloudflare 边缘证书)
```

- **内容源：GitHub Pages**。push 到 `main` 后由 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
  自动发布到 <https://beetman.github.io/xdremux-site/>。仓库 Settings → Pages 的 Source 为「GitHub Actions」，
  **不要再设置 Custom domain**（会和 Cloudflare 代理冲突，`github.io` 必须保持可直接访问作为源站）。
- **对外域名：Cloudflare Worker `xdremux-app`**（代码在 [`cloudflare/edge-proxy/`](cloudflare/edge-proxy/)）。
  Worker 的两个自定义域名由 Cloudflare **自动创建 DNS 记录并签发边缘证书**，然后以「缓存反代」方式把
  GitHub Pages 的内容挂在域名下：HTML 边缘缓存 5 分钟、静态资源 1 天；`www` 与 `http` 都 301 到 `https://xdremux.app/`。
- **为什么不直接用 GitHub Pages 自定义域名**：GitHub Pages 给这个域名签发证书卡在已知 bug
  （`https_certificate.state = new`，`request will begin shortly` 长期不变；社区确认只能由 GitHub Support 重排队列；
  反复删除/重加自定义域名还会把请求排到队尾）。Cloudflare Worker 自定义域名能自动完成 DNS + 证书，所以采用这个方案。
  如果 GitHub 修复了证书签发，可以删掉 Worker、把 GitHub Pages 的 Custom domain 设为 `xdremux.app` 回到单层架构。
- **Worker 更新**：
  ```bash
  cd cloudflare/edge-proxy
  npx wrangler deploy            # 需要已登录且有 Workers 权限的 Cloudflare 账号
  ```
- **旧入口**：`beetya.ng/xdremux/*` 由 beetya.ng 的 Pages Function（`BeetMan/beetya-dot-ng` 仓库）301 到
  `https://xdremux.app/`，仅作为旧链接过渡；不再需要时删掉该 Function 重新部署 beetya.ng 即可。
- 旧的 Cloudflare Pages 项目 `xdremux`（`xdremux.pages.dev`，Astro 版）已不再被引用，
  确认无误后可在 Cloudflare Dashboard 或 `wrangler pages project delete xdremux` 删除。
- 如果更换域名，需要同步修改 `index.html` 的 `link[rel=canonical]`、`og:url`、`og:image` / `twitter:image`，
  重新生成 `assets/og.jpg`，并更新 `cloudflare/edge-proxy/index.js` 里的 `APEX` / `BASE_PATH` 常量。

## 版本管理约定

- 单分支 `main`，每个改动一个小 commit；提交信息用 `fix:` / `feat:` / `docs:` / `chore:` 前缀。
- 需要给某个发布版本留档时打 tag（如 `v0.4.3-site.1`）。
- `preview-checks/`、`node_modules/`、`.wrangler/` 等本地产物不入库。
