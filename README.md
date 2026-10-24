# 方块小憩 · 经典模式

面向家人日常娱乐的 8×8 方块消除网页游戏。无广告、无内购、无账号、无必需后端。手机竖屏优先，支持鼠标和触控。视觉 V1.1 在蓝色主题上增强手牌尺寸和格槽层次，收紧布局并弱化底部按钮；[V1 与 V1.1 截图对比及验收记录](docs/visual-v1.1/README.md)说明调整效果及验证边界。

[本轮系统复刻记录](docs/replica-2026-10-24/README.md)是后续维护的入口：原图确认同形手牌可重复、发牌不再保解、重排/缩放中拖拽安全取消、分级消除及旧效果所有权、固定种子模拟、音画事件和性能证据均在此归档。[真实棋局音效 A/B](https://zslhentai.github.io/block-blast-web/audio-lab/scenes.html)复用同一套游戏程序，隔离正式进度；正式游戏仍用可关闭的现有音效，未经认可的采样不直接替换。

V2 在同一套静态视觉上增加落点提示、放置轻弹、行列消除、有限粒子、分级 Combo 和加分反馈，支持音效关闭与系统减少动态效果；[动画参数、关键帧与验收记录](docs/feedback-v2/README.md)说明触发条件及真机验证范围。

[现成采样试听库](https://zslhentai.github.io/block-blast-web/audio-lab/samples.html)按录屏定向筛选：本轮新增 Dustyroom 短和弦 R1，暂留用户反馈尚可的放置候选 P2，其余上轮素材仅归档。均为 CC0，含原声选段与轻加工 A/B、完整原文件及来源许可；尚未做人工听审，不保证听感相似。[录屏对照与验证记录](docs/audio-samples/README.md)。正式游戏保持原音效，前两版实验室保留。

音效实验室 V2 提供四类声音各两种原创 PCM 方向，可 [A/B 对比和密集试听](https://zslhentai.github.io/block-blast-web/audio-lab/v2.html)；[设计与验证说明](docs/audio-lab-v2/README.md)。第一版保留，正式游戏声音未接入候选。

音效研究候选在 [独立试听页](https://zslhentai.github.io/block-blast-web/audio-lab/index.html)，支持四类声音、当前版对照和 Combo 等级。正式游戏音效尚未替换，等待真机试听确认。[录屏分析报告](docs/audio-study-2026-10-24/report.md)区分了测量、画面观察与设计推测。

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
bun run test:balance
```

`bun run check` 串行执行类型、单元、E2E、防假阳性及便携版检查；`build` 与固定种子 `test:balance` 可单独运行。

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

GitHub Actions 的 `Verify classic MVP` 执行冻结安装、类型检查、单测、E2E 和防假阳性检查，并上传 `portable-preview` 可下载试玩附件。发布分支为 `work`：每次推送自动触发 `Deploy verified game to GitHub Pages`，重新运行全部验证，成功后才发布 `dist/`。其他分支和 PR 只验证、不发布；部署任务也会拒绝从其他分支手动发布，避免覆盖已验证版本。

首次启用请在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。若 `github-pages` 环境有限制，在 **Settings → Environments → github-pages → Deployment branches and tags** 允许 `work`，保留你需要的审批规则。仓库 **Settings → Actions → General** 也须允许本项目使用的 Actions。随后推送到 `work`，或在已有部署运行页面选择 **Re-run all jobs**。手动运行入口通常需要工作流先出现在默认分支；首次发布不依赖这个入口，使用 `work` 的 push 触发即可。

Vite 保留 `base: './'`，构建后的 JS/CSS 使用相对路径；E2E 验证生产文件在 `/block-blast-web/` 下运行。预期站点地址是 `https://zslhentai.github.io/block-blast-web/`，是否已上线以 [部署工作流](https://github.com/zslhentai/block-blast-web/actions/workflows/deploy.yml) 的结果和实际访问验证为准。网络限制、Pages 未启用或环境审批未完成时，推送成功不代表发布成功。最新记录见 [部署说明](docs/DEPLOYMENT.md)。

## 已实现玩法

- 8×8 棋盘，三个固定槽位，整组用完后补下一组；允许同形手牌（参考 IMG_8323/8326），玩家不能旋转。
- 拖拽落点和消线预览；越界、重叠、系统取消、尺寸改变不提交。
- 同时消除满行/列，交叉格只清除一次；无重力坍塌。
- 放置、消除、多线和连击奖励；没有剩余合法落点时结束，可重新开始。
- 棋盘、三槽、分数、最高分、连击、RNG、声音/效果设置完整保存；刷新后继续。坏档校验、上一份存档回退、存储不可用时继续内存游戏。
- 安全区和动态视口布局；桌面居中。短音效、分级消除/Combo 和有限粒子，提供静音和减少动画。

## 本项目规则 v1（不冒称原版算法）

放置每格 +1；消除并集中的每格 +10。多线额外奖励 `5×L×(L+1)`（L≥2），连击额外奖励 `20×(k−1)`；单格补齐一行 +81，单格补齐交叉一行一列 +181。连击允许间隔两步不消除，第三步断连；取消/非法操作不算步数。

39 个固定朝向，含斜对角两格的两个方向；斜对角包围框中的空白不占用棋盘格。发牌替代策略 `independent-weighted-v2` 按家族和体积组独立抽取，前十组小/中/大权重为 35/55/10，随后二十组平缓过渡至 30/55/15。允许同形、ID 不同；不按棋盘重抽、不修复或保证整组有解，因此新组也可能直接终局。不修改已经发给玩家的牌。颜色由独立哈希决定，不消耗玩法 RNG。存档格式不变，已保存的手牌保持原样。[复刻实施、固定种子模拟与验收记录](docs/replica-2026-10-24/README.md)。

## 目前限制

当前仅包含经典模式，没有收集/冒险模式、安卓 APK、道具、广告或支付。原版精确发牌概率与计分未验证；本项目规则可解释、可重放。

尚无真实 iPhone Safari/安卓 Chrome 或 WebKit 测试证据；需下一阶段真机验证安全区、地址栏、音效解锁和长时间使用。服务站点的 Service Worker 离线缓存和安装到主屏体验留到稳定性/部署阶段；目前可下载单文件离线试玩。存储被清理或更换浏览器/设备无法云同步。正常独立标签页有冲突提示，但复制标签页共享 sessionStorage 等并发边界仍需进一步验证。
