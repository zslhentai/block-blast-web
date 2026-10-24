# 视觉优化 V1：实现与验收

2026-10-24。同步基线：`1b1c243c967e3dc76281b885d59fc813477c86a6`（远端 `work`），工作区干净，本地与远端无分歧。

## 本次实现

- 蓝色纵向渐变与柔和中部亮区由页面统一绘制，Canvas 透明清屏，HUD、棋盘和手牌背景连续。
- 最高分移到左上，配自绘金色皇冠；本局分数居中放大，右上为浅蓝设置图标。暂停、新游戏移至底部，原入口、测试标识与行为保留。
- 8×8 棋盘增加细亮外框、暗内沿、独立圆角凹槽和内侧阴影。布局和输入共用原 `CanvasConfig`，几何始终为正方形。
- `drawCell`、`drawPiece` 复用 `drawBlock`，统一顶部高光、左亮右暗斜面、底座和向右下投影。颜色映射位于 renderer 的 `theme.ts`，规则层的颜色编号及存档格式不变。
- 待选块单格约为棋盘格的 45%，仍为三个固定槽位；拖拽时使用棋盘格尺度。五格横条/竖条都能容纳，不拉伸形状。
- 设置保留原生 dialog、checkbox、标签和焦点行为，新增蓝色外框/深蓝内板、分隔行、白色图标、绿色开关和右上关闭按钮。许可内容展开时，面板可滚动且关闭按钮保持可见。
- 棋盘静态层按布局、画布尺寸及 DPR 缓存，拖拽时不重复构造 64 个凹槽。尺寸或 DPR 改变后重建缓存；输入仍使用 CSS 像素，backing store 按 DPR 绘制。

未修改 `src/logic/`、`src/storage/`、`src/audio/`、`src/index.ts`、`src/renderer/input.ts`、`src/renderer/index.ts`。计分、消除、暂停/恢复、存档、发牌、终局和输入取消机制保持原实现；没有新增依赖、粒子、Combo 动画或复杂音效。

## 与原图对照

| 参考 | 本次效果 | 仍有差异 |
| --- | --- | --- |
| [8323 空盘](../../references/IMG_8323.png) | 蓝色背景、皇冠、中央白色分数、8×8 凹槽与三槽手牌 | 字体使用系统字体，皇冠/齿轮为原创 SVG；网页保留状态提示和底部操作入口，没有广告区 |
| [8326 混色棋盘](../../references/IMG_8326.png) | 共享倒角材质、饱和红蓝黄橙紫青色、相同光源方向 | 颜色与斜面是程序绘制近似，不是原版贴图；原图橙色块处在疑似拾起状态，本次混色截图先展示完整托盘，再另存拖拽状态 |
| [8324 设置](../../references/IMG_8324.png) | 蓝色面板、压暗背景、行分隔与绿色开关 | 中文标签、较短面板，仅保留已实现的音效/减少动画、规则和许可，没有 BGM、震动、推广入口 |
| 8325/8327/8328 消除与 Combo | 本轮只保留原有轻闪烁、预览和文字反馈 | 原版光带、方点、纸屑和 Combo 大字动画留待下一阶段 |

393×852 基准视口中，网页棋盘内格范围为 x≈23.08、y≈202.08、边长≈346.84 CSS px；外框另向外约 4px。按原图三等分的近似标尺，原图外框约 x=19.3、y=197.3、边长355。网页外框位置/大小已接近参考，但没有据此宣称像素级还原。短屏会主动缩小棋盘，保证手牌与底部按钮可达，不强行沿用长屏比例。

## 三种手机尺寸截图

以下全部来自 Linux Chromium 的设备/视口模拟，**不是 iPhone Safari 或真实安卓 Chrome 测试**。实际浏览器版本和文件哈希见 [screenshots.json](screenshots.json)，9 组原始布局测量见 [layout-validation.json](layout-validation.json)。

| CSS 视口 | 模拟配置与 DPR | 截图 |
| --- | --- | --- |
| 320×568 | `iphone-chromium`，DPR 3 | [短屏空盘](screenshots/empty-320x568.png) |
| 393×852 | `iphone-chromium`，DPR 3 | [基准空盘](screenshots/empty-393x852.png) |
| 412×915 | `android-chromium`，DPR 2.625 | [长屏空盘](screenshots/empty-412x915.png) |

其他场景：[混色棋盘](screenshots/mixed-393x852.png)、[触控拖拽中](screenshots/drag-393x852.png)、[设置面板](screenshots/settings-393x852.png)。这些 PNG 直接复制测试输出，未裁剪或重编码。

已逐张查看上述六张截图：棋盘方正，三槽未遮挡/溢出，横条格子保持正方形，拖拽放大块与棋盘格等比例，设置开关和文字没有相互覆盖。自动化也断言页面无横向/纵向溢出、分数不压住棋盘、手牌位于棋盘与底部按钮之间、画布像素宽度与 DPR 一致。

触控通过 Chromium CDP 的 touchStart/touchMove/touchEnd 执行，既验证棋盘数组，也验证目标格实际绘制的蓝色像素。三种尺寸均将蓝色三格横条准确放到第 4 行第 3–5 列（从 1 起数），得到 3 分；混色场景将橙色竖条放到预期两格，分数从 83 到 85。拖动中状态不提前提交。原有取消、非法位置、resize、消除、终局、刷新恢复测试保持通过。

## 本地检查结果

固定 Bun 1.3.11，通过仓库 `scripts/setup-cloud.sh` 安装到忽略的 `.tools/`，执行冻结依赖安装。未修改锁文件、package.json、全局代理或网络配置。

| 命令 | 结果 |
| --- | --- |
| `bun run typecheck` | 通过 |
| `bun run test` | 61 项通过，0 失败 |
| `bun run test:e2e` | 45 项通过，0 失败；桌面/iPhone 预设/Pixel 7 预设全部使用 Chromium |
| `bun run test:e2e:guard` | 通过；故意屏蔽生产脚本时，正向启动测试按预期失败，防止假阳性 |
| `bun run build:portable` | 通过 |
| `bun run test:portable` | 通过；载入后断网真实落子 6 次，联网刷新后状态完整恢复，无外部请求或运行错误 |
| `bun run build` | 通过；Vite 生产构建 |

单测增加所有目录形状在四组布局中的槽位/投影边界检查。原来的零行列断言兼容分数 CSS 坐标产生的 JavaScript `-0`，不改变输入投影算法。

保留 `100svh/100dvh`、safe-area、ResizeObserver、visualViewport 和高 DPI 支持。本轮未做 Safari/WebKit 引擎测试、手机真机、真实浏览器地址栏展开/收起、刘海/手势区或长期性能验证；不能以 Chromium 的 iPhone 预设名称作为这些场景的通过证据。

## 发布

继续由推送 `work` 触发现有 GitHub Actions，验证成功后发布 Pages；未改动工作流。站点地址为 <https://zslhentai.github.io/block-blast-web/>。本文件随实现提交，最终提交编号、Actions 结果及线上访问检查在交付消息中报告，避免将尚未完成的部署写成成功。
