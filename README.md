# 方块小憩 · 经典模式 MVP

面向家人日常娱乐的 8×8 方块消除网页游戏。无广告、无内购、无账号、无必需后端。手机竖屏优先，支持鼠标和触控。视觉暂保留上游的基础 Canvas 风格。

基于 [haoliu-dev/block-blast-phone](https://github.com/haoliu-dev/block-blast-phone)，固定提交 `8cf18eb45c4c4ea7b11283d55c51369e07d11ca4` 二次开发。原始 MIT 许可见 [LICENSE](LICENSE)，来源和改动边界见 [docs/upstream/SOURCE.md](docs/upstream/SOURCE.md)。研究报告见 [docs/research](docs/research)。

## 开发和验证

使用 Bun **1.3.11**；Node 24 可用于 Vite/Playwright。Bun 只在开发/构建时需要，手机运行的是静态 JS。

```sh
bun install --frozen-lockfile
bun run dev
```

在本机浏览器打开开发服务器的终端提示地址。需要手机试玩时，手机与开发电脑连接同一局域网，访问电脑的局域网 IP 和端口 3000；防火墙需要允许该连接。云机器的内部端口不会自动成为公网预览。

当前云环境可以运行：

```sh
bash scripts/setup-cloud.sh
export PATH="$PWD/.tools/bin:$PATH"
```

该脚本将缺失的固定版 Bun 安装到被 Git 忽略的 `.tools`，随后冻结安装、类型检查、单测和生产构建；保留 TLS 和包完整性校验。已安装正确 Bun 时会直接复用。

```sh
bun run typecheck
bun run test
bun run test:e2e
bun run test:e2e:guard
bun run build
bun run build:portable
bun run test:portable
```

`bun run check` 串行执行上述完整检查。

`test:e2e` 自行构建并启动 `dist/` 的静态服务，在真实部署子路径 `/block-blast-web/` 上验证。默认包含桌面 Chromium、iPhone 14 和 Pixel 7 的 Chromium 设备模拟。手机配置不是 Safari/安卓真机验证。当前机器使用现有系统 Chromium；其他机器可先运行 `bunx playwright install chromium`。

如已装 WebKit，可额外运行 `E2E_WEBKIT=1 bun run test:e2e --project=webkit --grep 'production script boots'`，但 WebKit 通过仍不是 iPhone 真机通过。需要 CDP 的触控测试只对 Chromium 项目运行。

`test:e2e:guard` 故意阻断生产 JS，要求正常的启动 E2E **以指定的启动断言失败、退出码为 1**；该防假阳性检查自身才返回成功。日志在 `artifacts/e2e-script-guard.log`，不会覆盖正常报告。

## 直接试玩和静态部署

`bun run build:portable` 生成 `artifacts/block-blast-mvp.html`，包含同一套代码、CSS 和版权声明。可下载后尝试用桌面浏览器直接打开，无需额外资源。已验证：通过 HTTP 载入这一个 HTML 后断网，仍能真实落子，恢复联网刷新后完整恢复进度。当前托管浏览器策略禁止直接访问 `file:`，因此本环境未能直接验证下载打开；如浏览器限制本地文件，可使用静态服务预览。`file:` 页面的本地存储行为由浏览器决定，页面会提示是否能保存；更换文件路径可能使用另一份存档。正式使用建议 HTTPS 静态网站。

`bun run build` 生成 `dist/`，可部署至 GitHub Pages 或其他静态托管；所有资源都是相对路径，不依赖 CDN。没有服务器 API。

本地检查实际 Pages 子路径：

```sh
bun scripts/serve-dist.ts
```

按终端提示访问端口 4173 下的 `/block-blast-web/`。该命令只用于本地静态预览，`dist/` 本身不依赖 Bun 服务。

GitHub Actions 的 `Verify classic MVP` 执行冻结安装、类型检查、单测、E2E 和防假阳性检查，并上传 `portable-preview` 可下载试玩附件。需要在线发布时：先推送/合并提交，保证工作流在默认分支可见；在仓库 Settings → Pages 将 Source 设为 GitHub Actions，再手动运行 `Deploy verified game to GitHub Pages`。部署前会重复使用同一验证工作流。完成后以 Actions 返回的真实站点地址为准。本轮本地提交不等于已经推送或发布。

## 已实现玩法

- 8×8 棋盘，三个固定槽位，整组用完后补下一组；每组三个不同的归一化朝向，玩家不能旋转。
- 拖拽落点和消线预览；越界、重叠、系统取消、尺寸改变不提交。
- 同时消除满行/列，交叉格只清除一次；无重力坍塌。
- 放置、消除、多线和连击奖励；没有剩余合法落点时结束，可重新开始。
- 棋盘、三槽、分数、最高分、连击、RNG、声音/效果设置完整保存；刷新后继续。坏档校验、上一份存档回退、存储不可用时继续内存游戏。
- 安全区和动态视口布局；桌面居中。只有短音效和轻消除闪烁，提供静音和减少动画。

## 本项目规则 v1（不冒称原版算法）

放置每格 +1；消除并集中的每格 +10。多线额外奖励 `5×L×(L+1)`（L≥2），连击额外奖励 `20×(k−1)`；单格补齐一行 +81，单格补齐交叉一行一列 +181。连击允许间隔两步不消除，第三步断连；取消/非法操作不算步数。

37 个固定朝向，按家族和体积组加权；前十组小/中/大权重为 35/55/10，随后二十组平缓过渡至 30/55/15。最多 12 次候选和 8,000 个搜索节点，优先选择有完整放置见证的手牌；超预算标记 unknown，回退确保新手牌至少有一个可放形状（目录中存在可放形状时）。不修改已经发给玩家的牌。颜色由独立哈希决定，不消耗玩法 RNG。

## 目前限制

当前仅经典模式 MVP，没有收集/冒险模式、安卓 APK、道具、广告或支付。原版精确发牌概率与计分未验证；本项目规则可解释、可重放。

尚无真实 iPhone Safari/安卓 Chrome 或 WebKit 测试证据；需下一阶段真机验证安全区、地址栏、音效解锁和长时间使用。服务站点的 Service Worker 离线缓存和安装到主屏体验留到稳定性/部署阶段；目前可下载单文件离线试玩。存储被清理或更换浏览器/设备无法云同步。正常独立标签页有冲突提示，但复制标签页共享 sessionStorage 等并发边界仍需进一步验证。
