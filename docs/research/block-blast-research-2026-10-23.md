# Block Blast 网页游戏：源码研究与实施方案

研究日期：2026-10-23（北京时间）。本轮仅研究、运行候选项目的审计检查和编写方案，没有导入游戏代码、修复候选源码、创建正式应用或部署网站。

**推荐以 `haoliu-dev/block-blast-phone` 的 MIT 版本为主基础，继续使用 TypeScript + Canvas 2D + Vite；保留既有规则模块，先修复审计发现的问题，再投入视觉与移动交互。当前不推荐迁移到 Phaser。** 这是本次候选中改造范围最合适的基础，不是已经满足全部要求的成熟成品。若将“无需修补、长期维护、手机网页真机验证完备”作为门槛，本次没有找到能证明同时满足这些条件的项目。

## 1. 环境、研究范围与规则证据

### 1.1 环境与 Skills

- 目标仓库 `/workspace/block-blast-web`：初始 HEAD `87502264ac5be4827d682ae0bf16be3495c63e36`，只有 README；研究前无未提交变更。
- 已检查 `/AGENTS.md`、`/workspace/AGENTS.md`、目标仓库及工作区内的 AGENTS.md；目标仓库没有适用指引。
- 云环境运行正常，受限 HTTP 网络策略已生效。沿用平台 GitHub HTTPS 认证，无需新增账号、密钥或后端。
- 云端和执行器 Skills 目录中只有 `cloud-environment:cloud-environment-runtime` 与 `cloud-environment-onboarding:setup`；未发现 Ponytail、Grill Me。已按运行技能检查环境和网络；上一轮已经完成配置技能流程。本轮不需要更改安装脚本或发布环境。
- 研究副本均在 `/tmp/block-blast-research`，不替换项目仓库。推荐候选的 AGENTS.md 要求 Bun、严格 TS 和移动交互测试；审计遵守其 Bun 安装及单测命令。其声明不能替代对实际源码、测试质量的检查。
- 可用工具：Node 24.19.0、Python 3.12.14、Chromium、Playwright。为候选审计在临时目录安装 Bun 1.3.11，未全局修改工具链。
- 没有连接 iPhone、安卓真机，也没有真实 Safari。本文的 Chromium 检查不是 iPhone Safari 或安卓 Chrome 真机验收。

### 1.2 证据的边界

指定的前四个 GitHub 仓库均成功读取；第五个 `asitech5info-prog/BlockBlaster` 的 HTTPS Git 操作和网页均返回不存在/404。该账号公开仓库列表中也未见这一名称。无法区分删除、改名、转私有等原因，因此不推断其功能或许可证。

另外筛查了 11 个仓库；重点继续阅读其中与网页复用有关的三个候选，以及 Rowflare 的规则、存档和触控源码。检索覆盖 GitHub 仓库搜索和 `block-blast`、`blockblast`、`block-blast-clone` topics，不能解释为穷尽 GitHub。

尝试访问官方应用商店条目及 Hungry Studio 网站时，代理返回 403，未绕过网络策略。官方参考入口为 [iOS 条目](https://apps.apple.com/us/app/block-blast/id1638611573)、[Android 条目](https://play.google.com/store/apps/details?id=com.block.juggle)、[Hungry Studio](https://hungrystudio.com)。**本次未能读取这些页面，不将它们列作已核实规则的证据。** 即便商店描述可读，也未必公开计分公式或服务器发牌参数。

当前对话及工作区没有可读取的用户游戏截图。开源项目自带截图只能说明各自界面，不能替代用户的原版截图。因此不能声称已完成像素级测量或视觉还原确认。

本文使用三类结论：

| 类别 | 含义 |
| --- | --- |
| 经典模式共同规则 | 用户明确要求，且多份公开实现一致；作为本项目的确定需求，不冒称已验证某个官方版本 |
| 源码事实 | 指定提交中可以定位到的实现，只说明该开源项目 |
| 本项目建议 | 为家庭娱乐、稳定性和可测试性提出的规则；未经确认的部分不是原版事实 |

### 1.3 经典模式共同规则

1. 8×8 棋盘；形状由若干格点组成，落定后不能移动，不存在重力下落或俄罗斯方块式压行。
2. 一组提供三个形状，任选放置顺序；全部用完才补下一组。方向在发牌时确定，经典模式不提供玩家旋转按钮。
3. 形状的每个实心格都必须在棋盘内且不与已有格重叠；颜色不影响合法性和消除。
4. 在落子后的同一盘面上，同时找出所有满行和满列，再统一清除其并集。交叉点只移除一次，行数和列数分别计入消线数量。
5. 清除后其他方块保持原坐标，不向下坍塌。
6. 对当前所有剩余形状枚举所有合法锚点；只要有一个形状在一个位置能放，就还没有结束。不能因其中一个大块放不下就结束。
7. 手中三个全用完时，先完成清除和补牌，再对新手牌判定结束，不能把暂时的空手牌误判为死亡。
8. 没有计时压力，暂停或后台停留不应改变棋盘和分数。

“每组严格三个不同形状”是本项目的明确约束；本次看到的多数克隆使用独立抽样、允许重复，**没有证据证明原版必定去重**。

### 1.4 原版仍无法证实的内容

- 每格放置分、每线/每个被清除格的奖励、交叉消除计算方式。
- combo 是连续落子消除、允许若干步不消除，还是其他窗口；倍数、封顶和断连时机。
- 完整形状目录、各朝向概率、三块之间是否独立、单格/3×3 的实际概率。
- 是否使用棋盘感知发牌、必有解筛选、局内动态难度，以及这些规则是否随平台或版本变化。
- 初始盘面是否始终为空、特殊奖励、复活与冒险模式的差异。本项目先采用空盘经典模式，不加入广告复活或道具。

不同克隆的源码对这些问题给出了互相不一致的答案。没有可靠依据把其中一个公式包装成“原版精确规则”；也不把 AI 仿真器中写着 “real game” 的注释当成逆向证据。

## 2. GitHub 源码对比、许可证与推荐

### 2.1 指定五个项目

提交、日期和提交数是本次读取时的快照；本报告中的日期统一换算为北京时间，原始带时区时间保留在 JSON 证据中。提交数来自 GitHub 页面，最新提交时间来自 Git 对象；它们不证明持续维护或真机质量。

| 项目 | 技术与架构 | 关键实现、形状和体验 | 测试、维护、许可与结论 |
| --- | --- | --- | --- |
| **ZLouisMiguel/block-blast** | 原生 JS ES modules + Canvas；Vite 开发/构建。`blocks.js`、`gameFunctions.js`、`script.js` 分文件，但规则与绘制仍混在工具模块中 | `GRID_SIZE=10`，不是 8；17 个形状条目，独立均匀抽三块，允许重复。先收集满行列再清除，遍历剩余块判负。`findBestGridPlacement` 遍历整个棋盘找最近合法位置，没有距离上限，可能把明显不在目标上的拖动吸附到远处。仅 mousemove/mousedown/mouseup；固定 600×600 Canvas，缺少触控、DPR 坐标处理和完整存档 | 最新 `f052d36`，2026-02-09，44 commits。未见测试、CI、标准 LICENSE；README 有允许 fork/build on top 的简短表述，但范围与义务不如正式许可明确。**不作直接代码基础**，即使补许可，移动适配和交互仍需较多改造。[Z1][Z2][Z3] |
| **MrCerise/block-blast** | Kotlin、Android 自绘 View/Canvas；`Game.kt` 是不依赖 Android 的规则层，另有 `GameView.kt`、`SoundManager.kt` | 8×8；44 个目录条目、40 个唯一矩阵，4 个 L/J 条目重复，导致隐含概率偏差。有落点预览、抬高手指上方的拖影、消除动画、合成音效、最高分与棋局保存。发牌用有限 DFS 检查整组三块是否可顺序放下，并随分数降低援助概率；搜索耗尽却返回 true，**不能把此返回值视作有解证明**。存档没有保存 streak/chainGrace，重开应用连击状态不完整 | 最新 `b421488`，2026-08-30，13 commits。MIT；读取到 12 个规则、6 个 View、2 个 Activity 的 `@Test`，本轮未搭建 Android/JVM 工具链运行它们。CI 的 assembleDebug/assembleRelease 不等同执行所有测试。**适合作为规则/手感的第二参考，不适合直接作为网页基础**；移植整个 View 会变成大规模重写。[M1][M2][M3][M4] |
| **Botkraker/block-blast-AI** | Python + NumPy 仿真引擎；Pygame 界面，Gymnasium、PyTorch、MaskablePPO 训练；engine/env/agents/app 分层明确 | 8×8；27 个固定朝向，预计算放置掩码，Python 64 位以上整数 bitboard；并集清除、合法动作、终局检测和 seeded dealer 清晰。发牌为有放回独立均匀抽样，hard_weight 用于训练课程。界面是桌面 Pygame，非移动网页 | 最新 `b8f710d`，2026-09-23，10 commits。README 宣称 190 tests 与引擎 100% 覆盖；本轮读取 engine 测试但未运行整个 RL 依赖栈，不能背书这一数量/覆盖率。根目录和元数据未见明确开源许可证。**只作为算法/测试思路参考，不复制源码或模型，也不把它的仿真分数当作官方规则**。[B1][B2][B3][B4] |
| **tokaa1/blockerino** | TypeScript + Expo 52 / React Native / React Native Web；Reanimated、react-native-dnd；SharedValue 保存局内状态 | 标准 8×8、三块；另有 10×10/五块 Chaos。24 个形状矩阵，按 distributionPoints 加权，但没有盘面可放性筛选，允许重复。支持触控拖拽、消线预览、立体斜面材质、500ms 碎块动画；Web 关闭原生 haptics。固定每格 46px，标准棋盘加边框约 374px，窄手机存在溢出风险。局内状态和预览 blockType 混合，`[...board]` 只浅拷贝。存储主要是分数列表，非棋局恢复 | 最新 `4885448`，2025-02-17，36 commits。MIT。package 配 Jest，但未发现测试文件；未见 CI。源码没有完整终局流程，公开 [Issue #1](https://github.com/tokaa1/blockerino/issues/1) 也请求补 Game Over。DND 布局缓存使用手动 onLayout + 延时 workaround。**材质和触控体验有参考价值，整套 Expo 基础对纯网页目标偏重**。[T1][T2][T3][T4] |
| **asitech5info-prog/BlockBlaster** | 无法读取 | Git 读取返回 Repository not found；网页 404 | 不评估技术、质量、维护或许可；如以后获得有效新地址再补查，不因此索要 GitHub token |

### 2.2 各克隆计分机制的差异

以下都是源码事实，不是原版说明。记 `n` 为本次放置格数、`L` 为消线数、`U` 为被清除格的去重数量。

| 实现 | 公式/连击 |
| --- | --- |
| ZLouisMiguel | 只在消线时加 `100×L×k`；有消线的落子 `k++`，无消线立即归零；放置本身不加分 |
| MrCerise | `n + 10×U + 多线奖励 + 20×(k−1)`；多线表为 2→30、3→60、4→100、5→150、其余多线→200；首次连击无 streak 额外分。消除后可容忍两次不消线落子，第三次断连 |
| Botkraker | `n + 10×L×(1+落子前的连续消除次数)`；一次不消线即断连 |
| blockerino | 放置 `+n`；消线时 combo 增加 `L`，再加 `L×8×(combo/2)×n`；连续三个不消线落子后 combo 归零 |
| 推荐网页候选 Haoliu | `10n + 100L×m(L)`，m(2)=1.5、m(3)=2、m(4)=2.5、其余=1；没有跨落子连击状态，5/6 线奖励会倒退 |
| Kvc 网页候选 | `10n + 100L×k + (L>1 ? 50L : 0)`；无消线即断连 |

这张表也是不采用“搜到一个公式就照搬为官方”的直接依据。

### 2.3 补充候选

| 候选 | 阅读结论 | 是否选用 |
| --- | --- | --- |
| **haoliu-dev/block-blast-phone** | TS + Canvas 2D + Vite；无生产依赖。规则已拆为 types/state/shapes/placement/lineClear/scoring/gameover/reducer；形状库为 18 个原始模板，展开归一化旋转后有 30 个唯一朝向；模板重复导致朝向不等权，三块独立生成允许重复，无棋盘筛选。有 Pointer Events、预览、动画和 Web Audio、Bun 单测、Playwright、Pages workflow。MIT。最新 `8cf18eb`，2026-02-18，54 commits；完整历史显示均为同一作者在 2 月 17–18 日提交，不能称为长期维护 | **推荐主基础**，详见实测和明确修补范围 [H1]–[H8] |
| **Aerse/seed-block-blast** | MIT；TS + PixiJS 7 + GSAP + Webpack；8×8，随机形状/朝向、拖拽、预览、粒子、开始/暂停/结束屏及 Pages workflow。核心 Game.ts 接近千行，PIXI 对象直接进入游戏状态，规则/视图耦合；未见自动测试、完整存档。`checkLines` 在手牌恰好剩一个时才触发判负，不满足所有剩余手牌状态的统一判定；布局常量 400×700。最新 `55f39ac`，2025-01-14，11 commits | 比从零搭 Pixi 更省事，但不比推荐基础更合适；无需为引擎迁移承担拆分成本 [A1][A2] |
| **Kvc34/Block-Blast-With-Rotation** | MIT；单个 1281 行 HTML，DOM/CSS 棋盘 + 粒子 Canvas + 自合成 Web Audio。8×8、Pointer Capture、预览、多线动画、最高分都有。玩家可旋转，判负也遍历旋转，只将重启按钮变红；无完整棋局恢复。依赖在线 Tailwind、Google Fonts、FontAwesome。消除实际状态写入 setTimeout，期间没有统一输入锁；pointercancel 共用松手函数。最新 `4e78787`，2026-10-14，7 commits | 可参考斜面块、原创合成效果；整份改成标准经典模式并拆模块比保留已有 TS 模块更费事，不作主基础 [K1] |
| **danteberishaj/block-blaster（Rowflare）** | MIT；Expo/React Native，有纯 TS logic/runState/storageCore，测试包括交叉消除、发牌修复、存档校验。读到了 board-aware tray repair、基于 StorageKV 的存储接口、重算终局和独立 onCancel；较推荐基础更重视状态恢复。最新 `3d4d5d9`，2026-07-19，12 commits。还包括 Hint/Shuffle/Bomb 和安卓广告模块；源码有平台门控，不能说 Web 必然播放广告 | **值得作为存档与公平发牌的第二参考**。不引入 Expo、原生广告、道具或第二套状态机。其纯 TS 存档校验可在 schema 适配成本足够低时局部移植并保留 MIT 署名；否则只借鉴测试场景 [R1][R2][R3] |

其余筛查：`akashmir/block-blast-pro` 是包含广告/内购/分析功能的 Expo 路线；`manthanjj/block-blast` 也是 Expo；`andrianllmm/byteblast` 是 MIT/Pygame，可解发牌和回溯求解值得参考，但不是网页基础；`csd4ni3l/shatterstack` 是 Python/Pygame、GPL-3.0 路线；`ahmet-Bonzo/Block-Blast-clone` 是 C/raylib、CC BY-NC 文本许可；`GSRHaX/BlockBlaster` 是需要 Express/sharp 的截图求解服务，非目标无后端游戏；`StaticQuasar931/BlockBlast` 未见明确 LICENSE。它们不进入主方案，也没有被声称全部深度运行验证。

### 2.4 推荐候选的实际审计

在固定提交 `8cf18eb45c4c4ea7b11283d55c51369e07d11ca4` 的临时副本中执行，未改上游源码、声明或锁文件：

| 检查 | 本次结果 | 能证明与不能证明的内容 |
| --- | --- | --- |
| `bun install --frozen-lockfile` | 通过，18 packages；Bun 1.3.11 | 可按锁安装；未关闭 TLS/校验 |
| `bun test src/logic/` | **33 pass / 0 fail**，7 files、55 assertions | 有可直接保留的规则回归基础；不能证明所有边界、移动输入正确 |
| `bun run build` | 通过；JS 28.50kB，gzip 8.32kB，另 HTML 0.72kB | 可构建为小型静态产物；Vite 成功不等于 TS 全量检查通过 |
| `tsc --noEmit` | **失败，退出码 2** | 8 个测试文件缺少 bun:test 类型声明；需补 Bun 类型或合理划分 TS 检查配置，不关闭 strict 绕过 |
| `bun test src/renderer/index.test.ts` | **0 pass / 1 fail** | mock 缺少 window 等浏览器对象；现有默认单测命令跳过这一 renderer 测试 |
| 上游 4 项 E2E，对正确 dist 服务运行 | **4 pass** | 使用上游测试，只把浏览器路径/服务地址/产物路径放在外置审计配置中；断言很弱 |
| 同样 4 项 E2E，对文档/CI 的源码根目录 Python 服务运行 | **仍为 4 pass**，但模块因 TypeScript MIME 报错没有执行 | 直接证明“有 Canvas/有 context”不能用作玩法闭环；上游 E2E 会假阳性，必须补分数、棋盘、手牌、终局等断言 |

独立 Chromium 154 探针使用 390×844 CSS 视口、DPR=2，导入候选现有模块并设置可复现局面；输入检查使用合成 PointerEvent，不是真实触控设备：

| 已复现问题 | 证据/影响 | 二次开发修复边界 |
| --- | --- | --- |
| pointercancel 错误落子 | 合法预览后发送 cancel，(0,0) 从空变 1、分数 0→10、手牌 2→1 | 独立 cancel/blur/visibility/lost capture 路径，只撤销拖拽；up 才允许 commit |
| 存档没有接通 | 落子后 `block-blast-data` 仍为 null，新建渲染器后棋盘/分数/最高分均为 0；分数写盘调用未接入 dispatch | 完整 GameSnapshot、每次有效状态变化保存、刷新恢复和错误降级 |
| gameover 状态仍接受落子 | 调用 reducer 的 PLACE_SHAPE 后 gameover→playing 并加分 | reducer 校验 status，不只依赖 UI 屏蔽 |
| 非手牌形状可落子 | 传入 foreign shapeId，棋盘和分数改变，手牌数量没变 | 用 slot/id 找当前权威 shape，校验版本和已消费状态 |
| 多线奖励倒退 | 同放一格，4 线得到 1010；5 线只得 510 | 改为已确认的单调奖励规则，测试最大可达消线数 |
| resize 后坐标与像素尺寸脱节 | CSS 变成 844×390，原 Canvas backing store 仍为 780×1688（DPR=2） | 统一 layout、ResizeObserver/visualViewport、DPR 和坐标变换 |

另有源码可见的改进项：没有 pointerId 捕获/主触点隔离；固定四格的垂直拖拽偏移对鼠标也生效；手牌使用 filter 后向左移动，未保持三个固定槽；消除/粒子/浮字集中在 622 行 renderer，背景音乐模块 511 行；拖影绘制与预览锚点相差半格的定义需要统一。现有 `Math.random()` 与随机旋转目录会造成重复朝向的隐含权重，无法用 seed 重放。

保存的 [browser-audit-2026-10-23.json](browser-audit-2026-10-23.json) 是本次探针原始结果；[source-snapshots-2026-10-23.json](source-snapshots-2026-10-23.json) 记录成功读取的 15 个源码提交。测试通过数字仅对应上表命令，其他候选的测试没有被宣称运行通过。

### 2.5 采用边界与许可处理

| 处理 | 模块/内容 |
| --- | --- |
| **优先直接复用** | Haoliu 的 Board/Shape 类型及 8×8 状态构造；`canPlace`、不可变 `placeShapeOnBoard`；先检测后清除的 `checkAndClearLines`；遍历全部剩余形状的 `checkGameOver`；已有规则测试；Vite 生产构建和 Pages 工作流骨架 |
| **在原模块上改造** | reducer 加状态/槽位验证、连击和确定性发牌；lineClear 返回 rows/cols/去重 cells 用于动画；shapes 归一化和去重；scoring 改为确定规则；canvas/draw 的布局和材质；Pointer Events 输入；音效生命周期；现有测试与 CI 的真实断言 |
| **必须补齐的新模块** | 棋局快照和版本迁移、可靠最高分保存；公平发牌器和可重放 RNG；离线 Service Worker/Manifest；统一取消路径和动画状态协调；设置与明确游戏结束界面、存档失败提示。尽量在现有扩展点实现，不另造一套游戏引擎 |
| **不直接搬入** | 原版 Logo、专有插画、音效/录音；无清楚许可项目源码或模型；Expo/Android/训练依赖、广告/支付/账号服务；未验证的“原版概率/算法” |

Haoliu、MrCerise、blockerino、Aerse、Kvc、Rowflare 的 MIT 允许修改、复制、发布及商业使用，但需要保留相应版权和许可文本。后续导入时记录提交与文件对应关系，保留主基础 LICENSE，添加第三方说明和游戏内“关于/开源许可”入口。只借鉴想法和实际复制代码要分别记录；不同 MIT 项目可以兼容，但不因此整合多个引擎。

标准 LICENSE 缺失不等于拥有任意改编发布权；README 的短句许可也需谨慎界定。GPL 路线并非“不可用”，但若采用其代码，需要满足对应分发/源码义务，本项目没有必要为此引入新约束。项目代码许可证不能替第三方字体、音乐和原版商标授权；默认使用系统字体、程序绘制块和独立合成短音效。Bun 仅为开发工具，手机浏览器运行构建后的 JS，不需要安装 Bun。

## 3. 推荐技术架构与原因

### 3.1 选型

| 路线 | 对本项目的收益与成本 | 决定 |
| --- | --- | --- |
| **TS + Canvas 2D + Vite + Bun + Playwright** | 能直接保留候选规则与基础渲染；8×8 仅 64 格，加少量形状与粒子足够；无游戏运行依赖，体积实测很小；DOM 辅助 HUD/弹窗易访问 | **采用**；沿用上游工具链，修补缺失类型和测试配置 |
| TS + Phaser | 场景、输入、tween、资源和粒子系统成熟，未来复杂场景可受益；但现有候选不使用 Phaser，需要重做渲染和坐标接入，物理/相机等当前需求很少 | 本轮不采用；只有后续实测证明 Canvas 是瓶颈，或功能增长显著时才单独决策 |
| TS + PixiJS | Aerse 已有画面/粒子，适合较多 GPU sprite；需要修补耦合、判负与存档，并维护 Pixi/GSAP/webpack 依赖 | 不迁移 |
| Expo/React Native Web | blockerino/Rowflare 已有移动组件，未来原生跨端收益较大；当前只做网页，需要额外框架与平台适配，部分现成触控/存储也要修 | 暂不采用；未来可用 WebView/Capacitor 包装本网页，无需现在开发 APK |

### 3.2 模块组织与状态约束

沿用现有 `src/logic`、`renderer`、`audio`、`storage` 目录，并按职责扩展：

```text
logic/       types、state、placement、lineClear、gameover、reducer
             shapes/catalogue、dealer、rng、scoring（均无 DOM/Canvas）
renderer/    canvas/layout、draw/blockMaterial、input、effects、协调入口
ui/          HUD、设置、继续/新游戏、结束弹窗、简短玩法提示
storage/     snapshot、validation/migration、localStorage adapter
audio/       合成短音效与生命周期管理
pwa/         manifest、离线缓存与更新策略
tests/       规则/性质/输入/存档测试、真实断言的浏览器 E2E
```

棋盘以现有 `number[8][8]`（0 为空、其余为颜色索引）为权威状态；64 格无需引入复杂 ECS、物理引擎或全局状态库。发牌搜索可派生 8 个 8-bit 行掩码加速，**不能把 Python 的 64-bit bitboard 直接写成 JS 普通位移**，JS 位运算会截为 32 位。初版仍以可读数组实现为准，只有测量后再缓存掩码。

一个有效落子按固定顺序完成：验证 `status + slot + pieceId + 坐标` → 不可变放置 → 同时找满行列 → 并集清除 → 计分/连击 → 标记固定槽为空 → 必要时补完整新组 → 判负 → 保存最终状态 → 发送 MoveResult 给渲染。

`MoveResult` 包括落子格、消除行/列/去重格、分数分项、连击变化和是否换组。规则不等待动画回调；短暂的 resolving 输入阶段只是表现层状态。动画使用旧画面快照，不再控制“300ms 后才真正清除”的规则提交。即使动画中切后台/刷新，也恢复最终合法棋局。新局会取消旧动画和延时任务，避免旧回调污染新局。

## 4. 经典玩法、生成、计分与视觉实施方案

本节数值均为**本项目提案**，不是已证实的原版常数。先固定规则版本，再用模拟与试玩调参。

### 4.1 形状与公平发牌

建议初始目录为 37 个固定朝向：单格 1；长度 2–5 直线 8；2×2/3×3 方形 2；2×3/3×2 矩形 2；三格小拐角 4；L/J 四格 8；T 四格 4；S/Z 四格 4；五格大拐角 4。玩家不能旋转；不在第一版加入无证据的 P/U、十字形或特殊道具形状。截图/实际观察若给出可靠新形状，再按 catalogueVersion 增补。

复用基础项目的旋转归一化方法在构建目录时生成朝向，用归一化格点集合去重；发牌时按目录选定朝向。每组严格三个不同的归一化朝向；颜色不同不算不同形状，同一形状旋转后格点集合不同则算不同朝向。可把 family 级去重设为调参项，但第一版不进一步限制为三个不同家族。

按家族抽样、家族内部朝向等概率，避免“某种形状因为列了八个旋转条目就天然多发八倍”。初始可用分组权重：

| 分组 | 家族 | 前 10 组总权重 | 第 11–30 组逐渐过渡，之后封顶 |
| --- | --- | --- | --- |
| 小块 | 单格、双格、三格直线、三格拐角 | 35% | 30% |
| 中块 | 四格直线、2×2、L/J、T、S/Z | 55% | 55% |
| 大块 | 五格直线、3×3、2×3 矩形、五格拐角 | 10% | 15% |

组内同组别家族先等权；抽中已有朝向时按剩余候选重新归一化。表中是原始候选权重，**盘面筛选后的实际出牌分布会改变，必须另外统计，不能宣称仍精确服从该表**。难度按完成手牌组数平缓变化，不绑定未来可调整的计分数值，不基于广告、付费或“故意让人输”调牌。

发牌流程：

1. 使用可注入、可保存状态的 seeded RNG，记录 RNG/目录/规则版本；随机颜色与逻辑形状的随机流分开，动画随机数不改变后续牌。
2. 抽三种不同朝向，优先寻找存在完整放置序列的手牌。验证必须考虑三块的全部顺序，以及每次落子后的行列消除；“三块各自现在能放”不等于三块能全部放完。
3. 初值最多 12 组候选、总计 8,000 搜索节点；用 solved/unsolvable/unknown 三态。超预算是 unknown，不能像 MrCerise 那样返回 true 并称“保证有解”。有解必须保留可重放的见证序列。
4. 预算内找不到完整有解组时，回退为“从全部目录可放形状中选至少一块，加另两种不同朝向”。只在换组时做这种修复，不改动已发给玩家的牌。
5. 如果手中还有牌而它们全无法放，立即按规则结束，不能偷偷换成小块。若换组时整个目录都无形状能放，同样结束。不得为了三块互异而无限重试。

这是一种家庭娱乐取向的公平替代：减少随机死牌，但不保证玩家任意走法都能用完整组，也不承诺无限可玩。优先完整可解组可能让高手玩得很久；实际局长和回退频率需要固定种子模拟及家人试玩校准。发牌目标耗时 <8ms；若低端真机实测超预算，先降低预算/分帧，再考虑单独 Worker，不一开始引入额外架构。

### 4.2 可说明、可测试的计分与连击

推荐沿用 MrCerise 的“放置 + 去重消除 + 多线 + 温和连击”结构，保留基础项目 scoring 模块接口并扩展分项：

```text
n = 放置格数
L = 满行数 + 满列数
U = 满行/满列覆盖格的并集大小
k = 本次消除后仍在同一连击链中的消除落子次数

无消除：Δ = n
有消除：Δ = n + 10U + B(L) + 20·max(k−1, 0)
B(1)=0；L>=2 时 B(L)=5L(L+1)
```

因此多线奖励 2→30、3→60、4→100、5→150、6→210，向上连续定义，修复上游表格断层。以首次消除为例：单格补齐一行 `1+80=81`；单格补齐交叉一行一列 `1+150+30=181`，交叉点不重复计清除格分。三行三列时 U=39，若用 3×3 补齐，得 `9+390+210=609`。

每次消除使 k 增加 1，并重置“未消除步数”为 0；最多允许间隔两次有效但不消除的落子，第三次断连。无效落点、取消拖拽、暂停不算步数。下一次消除若未断连，则继续加 k；换组本身不清零。连击状态随棋局保存。

不额外加入未经证实的全清、时间或随机大奖。最高分按规则版本归档，调分后不把不同规则的记录混成同一个公平排行。若后续获得原版连续录像，可通过“落子前/后棋盘、n、L、U、显示增分、间隔步数”逐帧核对，再决定是否调整。

### 4.3 视觉与反馈

最终以用户截图为主。当前只提出待校准的蓝色经典主题方向，**不把任何具体色值、格距称为截图测量结果**；也不照抄 MrCerise 的棕金主题或候选的玻璃仪表板。

| 部位 | 实施方案 | 验证方式 |
| --- | --- | --- |
| 整体 | 深蓝/靛蓝背景、深色棋盘与饱和彩块；顶部最高分较小、当前得分最大、设置按钮不抢占中心 | 截图到位后量相对棋盘边界、HUD 中心和留白，不按网页卡片模板布局 |
| 棋盘 | 8×8 独立暗格，细间隙、轻内凹；外缘与内部节距统一。建议初始 gap 为 cell 的 3–5%，随尺寸等比变化 | 320–430px 宽下格子方正，边框/gap 与命中坐标同源 |
| 方块 | 程序绘制面色、上/左高光、下/右深边、轻中心渐变与短投影；参考 blockerino 的边缘明暗关系。缓存每种颜色/尺寸的纹理，不每帧重建渐变 | 与原版截图匹配明暗方向和立体层次；不使用抠图 Logo/专有素材 |
| 三个待选槽 | 固定位置，各槽独立居中，小于棋盘格的缩略比例约 0.55–0.65；用完槽留空，不使剩余形状滑到另一个槽 | 连续放 6 块，槽位、id、触控命中保持一致；大形状也不挤出屏幕 |
| 拾取/拖拽 | 60–90ms 内轻放大至棋盘格尺寸，触控拖影位于手指上方，鼠标只保留抓取点偏移；拖影和落点预览必须使用同一锚点投影 | 同一 pointerup 所提交格与最后合法预览完全相同 |
| 合法预览 | 半透明同色方块；若可消线，对将消除的整行/列轻提亮；不改权威棋盘 | 来回移入移出合法点，棋盘/分数/存档均不改变 |
| 非法/取消 | 清除合法落点提示，局部柔和红边或降低拖影透明度；120–180ms 归位，无计分；不做强烈全屏抖动 | 越界、重叠、离屏和系统取消均不误落子 |
| 落定 | 约 70–100ms 的轻微压缩回弹；落子音短促，可静音 | 反馈在下一帧出现，不等待网络 |
| 消除 | 约 40–70ms 提亮 + 160–240ms 收缩/碎片，整体约 220–320ms；行列交叉格只播一份；少量粒子，目标上限 120 | 多线同时消，粒子不挡手牌；后台恢复不重复计分；低效果模式可关闭粒子 |
| 加分/连击 | 得分数字 200–350ms 平滑追到真实值；“+增分”“双线消除”“连击×k”在约 600–900ms 内淡出 | 刷新/快操作时真实分数不受数字滚动影响；不连续堆叠遮挡棋盘 |
| 结束 | 等落定/主要消除效果结束后显示得分、最高分、再来一局；设置中有明确的新游戏操作，覆盖未完局前确认 | 没有广告复活、倒计时、内购和登录入口；重新开始保留最高分与设置 |

音效沿用可复用的 Web Audio 短音合成思路，重新校准音量与包络；一份 AudioContext、首次用户手势解锁，后台暂停，失败则静音继续。第一版不使用候选的长背景乐编曲；不复制原版录音。震动只是可选增强，不依赖 iPhone 支持，不支持时保持视觉和声音反馈。尊重 reduced-motion，减少放大、粒子与震屏。

## 5. iPhone、安卓与桌面适配、离线和存档

### 5.1 手机优先布局

- `viewport-fit=cover`，四边读取 `env(safe-area-inset-*)`。`100dvh` 配合 `svh/vh` 回退，处理 Safari 地址栏伸缩；使用 ResizeObserver 和必要的 visualViewport 变化通知更新布局。
- 先扣安全区，再分配 HUD、正方棋盘、固定三槽和必要留白；不把桌面 600px 画布简单 CSS 缩小。初始侧边距 12–20 CSS px，棋盘在桌面/平板封顶约 480px；短屏优先收紧留白并缩小棋盘，始终保留可操作手牌。
- 布局求最大 B，满足 `B + Htray(B) + Hhud + gaps <= Hsafe` 与 `B <= Wsafe−2margin`；Htray 包括最多五格形状的缩略高度。顶部/底部占位不能使用未经测量的固定比例把棋盘挤出视口。
- 常见验收视口：320×568、360×640、375×667、390×844、393×852、412×915、430×932；再加短横屏、平板和 1366×768/1920×1080。电脑端居中呈现游戏区域，鼠标自然拖拽；横屏不拉伸棋盘，不清空现有局面。
- 菜单/关闭/静音按钮触控区域至少 44×44 CSS px；游戏棋盘单格可以小于这个值，但必须通过整形状拖动与预览定位，不要求精点单格。

### 5.2 输入和像素坐标

使用 Pointer Events 统一鼠标/触屏。只接受当前 activePointerId；开始后 setPointerCapture，避免拖出 Canvas 时丢失松手；其他触点不抢夺。`pointercancel`、`lostpointercapture`、window blur、后台切换只取消，不提交；resize 中取消拖拽再重算布局。

游戏交互面设置 touch-action:none、user-select:none、webkit-touch-callout:none，阻止拖拽时网页滚动、长按选中文字。把这些限制限定在游戏面；菜单和说明保留正常可访问性，不靠全页面禁用缩放来掩盖布局问题。

定义一套 CSS 逻辑坐标：`x=(clientX−rect.left)×logicalWidth/rect.width`，y 同理。Canvas backing store 才乘 DPR，绘图用 setTransform 设置 DPR；DPR 变化后重设，避免重复 scale。不再把输入坐标又乘一次 DPR。预览、拖影和提交共用同一个 projection 函数，pointerup 重算最终位置，且仍要由规则层复核。

触控抬升初值约 1.2–1.8 格，并结合形状高度/抓取点使形状底缘高于手指；通过真机校准，避免当前候选所有设备固定抬四格。鼠标不加触控抬升。吸附只在邻近格点/有限容差内进行，不能为了合法性跳到远处空位。pointermove 合并到 rAF，盘面预览只在锚点或合法性变化时重算。

### 5.3 自动保存与恢复

快照包含 schemaVersion、ruleVersion、catalogueVersion、board、固定三槽的 pieceId/颜色/空槽、score、combo、未消除步数、组数、RNG 状态、局标识和保存序号；最高分与声音/效果设置独立保存。终局可由棋盘和手牌重算，不能信任旧布尔标记。

每次**有效**落子完成整个规则事务后保存，visibility hidden/pagehide 时再补保存；不等 unload，也不逐 pointermove 写盘。localStorage 的单 key JSON 更新是同步操作，小棋局无需数据库或账号。保留上一份通过校验的快照作回退，捕获 quota/security/JSON 异常；故障时继续内存游戏，并给出简短“此浏览器暂不能保存”的状态提示。

加载要验证 8×8、颜色范围、形状存在且无重复格、三槽结构、整数非负分数、版本、RNG 格式；不能对任意 JSON 直接类型断言。保存正在消除时的最终规则状态，而非半帧粒子；继续游戏不会自动补牌、断连或重复加分。旧版本迁移失败只重置当前局，不擦除有效最高分。多个标签页通过 storage 事件或轻量通道提示已有另一局，避免较旧状态覆盖较新状态。

浏览器清理网站数据、隐私模式限制、存储被系统回收都可能丢档；无账号/后端不能保证跨设备同步或永久保存。可以后续加本地导出/导入，但不作为首阶段必需项。

### 5.4 GitHub Pages 与离线

- 沿用静态 Vite 构建；相对 base 和所有资源路径都以部署目录为准，在 `/block-blast-web/` 子路径验证，不能只测站点根目录。单页入口无服务端路由要求。
- Manifest 提供独立名称、自制图标、start_url/scope 与 standalone。安装到主屏只是可选入口，普通 Safari/Chrome 标签页仍可完整玩。
- Service Worker 只缓存本游戏路径下的 HTML、带 hash 的 JS/CSS、图标等本地资源；全部字体/音效本地或程序生成，不依赖 CDN。版本缓存前缀限本应用，不能删除同域其他 Pages 项目的缓存。
- 首次成功联网加载并完成 SW 安装后才具备离线重开能力；首次完全离线访问不承诺可用。普通浏览器页面和添加到主屏的模式分别验证。
- 新版本等待安全时机切换，提示可在本局结束/主动刷新后更新；不在拖拽或消除过程中强制 activate/reload。新版切换前保存快照，存档迁移独立于静态缓存清理。
- 目标工作流：冻结锁安装 → 规则/输入/存档测试 → TS 检查 → build → 对 dist 启动静态服务并做浏览器 E2E → 上传 dist 到 Pages。必须给 CI 配正确 webServer/cwd，捕获 pageerror 和资源失败；不能沿用源码根目录 Python 服务的假阳性测试。
- 本轮没有触发 GitHub Actions、推送、开启 Pages 或发布；只准备方案。未来可用 Capacitor/WebView 包装同一 dist，存储、生命周期和 haptics 通过接口接入，本阶段不引入原生工程。

## 6. 分阶段开发计划与交付门槛

以下是实施顺序，不是已经完成的功能；每阶段按验收证据推进，工期应在确认视觉素材与真机范围后估算。

| 阶段 | 具体交付 | 进入下一阶段的门槛 |
| --- | --- | --- |
| **一：研究与方案（本轮）** | 本报告、固定源码提交、许可边界、候选实测、规则提案、视觉待校准项 | 用户确认主基础/技术路线及替代规则；拿到参考截图后补视觉标尺。本轮到此停止 |
| **二：经典 MVP** | 保留 MIT 署名导入指定基础；沿原模块修 reducer/输入取消/槽位；8×8、三种不同形状、预览、统一清除、多线、换组、明确终局、新局/继续、完整存档、最高分；实现版本化计分和保守公平发牌。补类型与真正运行的规则/交互测试 | 固定种子能从开局走到结束和重开；核心不变量、取消、存档回归全部通过；无已知阻断玩法问题。视觉可以先使用基础素材 |
| **三：视觉与手感** | 根据截图建立色板、尺寸和斜面材质；手机布局、手指抬升、有限吸附、落定/消线/加分/连击，短音效、设置和 reduced-motion；拆分过重 renderer，不换引擎 | 同一组场景的视觉审查通过；主要视口和鼠标/触控事件检查通过；效果开关不改变逻辑结果。至少一轮家人试玩反馈 |
| **四：稳定性与静态部署** | 性质/长局/多标签/坏档/升级/离线测试；真机 Safari/Chrome；性能与耗电检查；SW/Manifest；Pages 子路径和工作流；开源许可入口 | 下节发布必需项全部有证据；未知/未测设备单独记录。可部署产物、测试日志和部署步骤完整；实际发布由用户后续授权的范围执行 |

不把研究阶段扩大为 APK、排行榜、机器学习、道具系统或广告方案。也不因后续视觉精修而丢掉已验证的纯规则模块。

## 7. 可执行、可验证的验收标准

以下是未来实施的验收计划，本轮只完成第 2.4 节列出的候选审计。

### 7.1 规则、生成与计分（发布必需）

| ID | 场景和判定 |
| --- | --- |
| G01 | 对目录每个朝向枚举所有 64 个锚点，加负坐标/越界/重叠样例，结果与简单格点参考算法一致；非法操作返回原棋局和原分数 |
| G02 | 单格补齐满行，清除恰好 8 格、计 1 线；补齐交叉一行一列，清除恰好 15 个不同格、计 2 线，其他格坐标不变 |
| G03 | 预设 3 行 3 列等待 3×3 补齐，返回 6 线、39 个去重格；按建议计分首次得 609。再覆盖多行、纯多列、不消除场景 |
| G04 | 一块用掉只空该槽；前两块用完不补牌；第三块落子先清除再补三块，仅补一次；新组检查终局，没有“空手牌即死” |
| G05 | 剩余两块只有一块可放时仍可玩；所有剩余块都无法放才结束。方向不能旋转，不能按旋转后可放来延长经典局 |
| G06 | 单格补行首次 +81，交叉首次 +181；间隔 0/1/2 次未消除落子可继续连击，第三次断连；非法/取消不消耗窗口；1–6 线奖励不倒退 |
| G07 | 非 playing、空槽、旧 pieceId、非手牌形状、重复 pointerup 或旧局事件都不能落子/加分；单步最多消耗一个槽 |
| G08 | 对至少 10,000 个 seed、每局最多 1,000 步的合法随机/贪心序列：无异常、分数非负且单调、盘面值在范围内；每步格数守恒 `after=before+n−U`；保存/重放结果逐步一致；达到步数上限记为截断而非完成 |
| G09 | 100,000 次空盘发牌的首槽原始采样校验预设家族权重，三槽朝向去重 100%；最终棋盘筛选后的分布另报，不能拿它与独立抽样频率混算 |
| G10 | 搜索宣称 solved 的手牌均能重放其见证序列；unknown 不算 solved。盘面存在可放目录形状时，fallback 不生成全死牌；预算节点不超限，无无限循环 |

规则模块行/分支覆盖率目标至少 95%，重点是上述结果断言，不以测试数量代替质量。增加规则事件可观测接口，让浏览器测试读取棋盘/手牌/分数，而不是仅检查 Canvas 存在；此接口只用于测试构建或只读诊断。

### 7.2 输入、布局和视觉（发布必需）

- 在第 5.1 节全部视口，棋盘宽高误差 ≤1 CSS px，8 行/列节距一致，无横向滚动、被安全区遮住的控件或不可见手牌。
- DPR=1/2/3、页面尺寸变化、地址栏伸缩下，用相同逻辑坐标落到相同格；边界预览与提交逐格一致，无远距“自动找空位”。
- 用真正的浏览器输入序列验证 mouse、触控 Pointer Events、多点干扰、拖出 Canvas、快速松手、pointercancel、失焦、旋转屏幕、开关后台。cancel/resize/失焦前后棋盘、分数和手牌相等。
- 连续合法放六块，逐步断言每次分数和占格变化、前一组三槽耗尽及新三槽到位，不沿用“拖了几次最后 context 仍存在”的断言。
- 消除后换组/结束只发生一次；动画中刷新、重开、切后台再回到前台不重复加分。reduce-motion 和静音对同一 seed 的棋局结果无影响。
- 视觉验收用固定 seed/场景：空盘、混色中盘、触控拾起、合法/非法预览、行列同时消、连击、结束。收到原版截图后先确认参考图版本和裁剪安全区，按相同 CSS 宽度建立对照。棋盘边界、HUD 中心、手牌区域位置目标偏差 ≤棋盘边长 2%；材质/颜色由用户并排确认，不能用一个主观“相似度百分比”代替。

### 7.3 存档、离线、性能与部署（发布必需）

- 任意合法落子后刷新：棋盘、三个槽、分数、最高分、连击窗口及下一次发牌结果完全一致。落子动画中刷新也一致。开始新局不丢最高分和设置。
- 注入无效 JSON、错误版本、错误棋盘尺寸、未知 shapeId、重复格、非法数值、写入抛异常：无白屏；有效最高分保留，不能恢复的局面明确重置或回退。
- 本地存储不可用时能继续玩；两个标签页不发生静默旧档覆盖；模拟 SW 更新和旧快照迁移后可继续原局。
- 在 `/block-blast-web/` 生产子路径，全部资源正常；页面无未处理异常/模块 MIME 错误。完成首载和 SW 控制后阻断外网，重新打开/刷新可开新局、继续、计分与静音；浏览器模式和主屏模式分别记录。
- 对实际受测 iPhone Safari 和一台中档安卓 Chrome 各做 30 分钟持续游玩/反复重开：无冻结、进度损坏、意外网页滚动、双重落子、后台声音泄漏。至少覆盖一台短屏/小屏设备。记录型号、系统、浏览器版本、日期；没有真机记录就标“待验证”，不能批准真机兼容结论。
- 初始性能预算：本地交互可见反馈 ≤下一帧到约 50ms；常规动画目标 60fps，中档真机持续场景 P95 帧时间 ≤25ms；发牌 P95 <8ms、单次不产生 >50ms 的主线程长任务。测试注明设备和场景，不用云端帧率代替真机。
- 粒子有硬上限、后台停止 rAF/声音；100 次新局后没有持续增长的事件监听器、定时器、AudioContext 或效果对象。JS/CSS gzip 初始预算合计 <150kB，首屏总资源 <500kB（无长音乐），实际超标需说明资产原因。
- CI 必须执行冻结依赖、规则/存档/交互测试、TS 检查、build、针对 dist 的 Chromium 与 Playwright WebKit E2E；Firefox 可作补充。WebKit 通过仍不等于 iPhone Safari 真机通过。
- dist 包含完整离线资源和开源说明；没有广告、内购、登录、遥测或必需第三方网络请求；无后端启动步骤。Pages 实际发布后再验证 HTTPS、子路径、缓存更新和离线，不能只以本地构建成功作为部署通过。

平衡验收另用固定 10,000 seed 比较随机/贪心策略的局长、死牌、回退和形状频率，发布原始统计；家庭试玩建议 3–5 人，每人至少三局，记录误拖、看不清、过快失败和长局疲劳。统计只能帮助调参，不能证明与原版隐藏算法相同。

## 8. 尚未确认的问题、风险与下一步

| 项目 | 风险与处理 |
| --- | --- |
| 原版截图缺失 | 无法确定蓝色/棕色主题、具体格距、字体层级、手牌比例；正式视觉精修前需要用户参考图。普通静态图也不能证明动画时长、计分和随机概率 |
| 原版隐藏规则 | 公式/概率/难度未被官方或受控观测证实；先采用本文明确标记的替代规则，有证据后通过版本化规则调整 |
| 候选成熟度 | 推荐基础只有两天提交历史，测试有假阳性和明确缺陷；必须先修补，再将其称为可稳定玩。优点是规则边界小且已经分层，修补成本比整体迁移低 |
| 多项目整合成本 | 主引擎只采用一个；其他 MIT 只在少量模块/算法确有收益时复用，逐文件署名和测试，不叠加两个渲染器或状态机 |
| 发牌过易/过难 | 有解偏好可能延长高手局；预算回退不能承诺整组可解。对初值用模拟和实际家庭试玩校准，不伪造已完成的分布实测 |
| Safari/PWA 行为 | 安全区、地址栏、AudioContext、存储回收和安装模式需真机检查；当前环境没有这些验证能力 |
| 存档永久性 | 无账号/后端意味着只保存在当前浏览器环境，清理数据/换设备不能保证恢复。设计清楚提示，后续再考虑导出 |
| 许可/素材 | MIT 代码可以复用；用户截图用于参考，不意味着专有 Logo、声音或插画获得授权；使用独立名称、原创程序材质/短音效 |
| 第五个项目不可访问 | 当前不对它做选择依据；提供新公开地址后可补审，但不阻塞已有可行方案 |

**建议确认事项：主基础选 Haoliu、保持 TS + Canvas 技术路线；认可“原版无法证实的部分使用公开可说明的公平发牌与计分方案”；补充实际截图及主要家庭手机型号后细化视觉与真机矩阵。** 当前不进入正式开发，等待确认后才实施第二阶段。

## 附录：固定提交的源码证据

以下链接固定到本次读取的完整 SHA，避免未来 main/master 更新导致依据漂移。

[Z1]: https://github.com/ZLouisMiguel/block-blast/blob/f052d363bda10d9498e714b6fbe834c7fb91b9f7/src/gameFunctions.js#L3-L4
[Z2]: https://github.com/ZLouisMiguel/block-blast/blob/f052d363bda10d9498e714b6fbe834c7fb91b9f7/src/gameFunctions.js#L151-L287
[Z3]: https://github.com/ZLouisMiguel/block-blast/blob/f052d363bda10d9498e714b6fbe834c7fb91b9f7/src/script.js#L57-L173
[M1]: https://github.com/MrCerise/block-blast/blob/b4214881f99708b6009b48bfe839c4d28bd0ce22/app/src/main/java/com/mrcerise/blockgame/Game.kt#L34-L95
[M2]: https://github.com/MrCerise/block-blast/blob/b4214881f99708b6009b48bfe839c4d28bd0ce22/app/src/main/java/com/mrcerise/blockgame/Game.kt#L160-L297
[M3]: https://github.com/MrCerise/block-blast/blob/b4214881f99708b6009b48bfe839c4d28bd0ce22/app/src/main/java/com/mrcerise/blockgame/Game.kt#L299-L377
[M4]: https://github.com/MrCerise/block-blast/blob/b4214881f99708b6009b48bfe839c4d28bd0ce22/app/src/main/java/com/mrcerise/blockgame/GameView.kt#L1143-L1168
[B1]: https://github.com/Botkraker/block-blast-AI/blob/b8f710d319d6f2065feb52ccaeca97d90bcbf9f0/src/blockblast/engine/board.py
[B2]: https://github.com/Botkraker/block-blast-AI/blob/b8f710d319d6f2065feb52ccaeca97d90bcbf9f0/src/blockblast/engine/game.py#L46-L120
[B3]: https://github.com/Botkraker/block-blast-AI/blob/b8f710d319d6f2065feb52ccaeca97d90bcbf9f0/src/blockblast/engine/dealer.py
[B4]: https://github.com/Botkraker/block-blast-AI/blob/b8f710d319d6f2065feb52ccaeca97d90bcbf9f0/src/blockblast/engine/scoring.py
[T1]: https://github.com/tokaa1/blockerino/blob/488544878d4f19e16fad043450c13e5070de4689/constants/Board.tsx#L64-L101
[T2]: https://github.com/tokaa1/blockerino/blob/488544878d4f19e16fad043450c13e5070de4689/constants/Piece.tsx#L17-L224
[T3]: https://github.com/tokaa1/blockerino/blob/488544878d4f19e16fad043450c13e5070de4689/components/game/Game.tsx#L77-L135
[T4]: https://github.com/tokaa1/blockerino/blob/488544878d4f19e16fad043450c13e5070de4689/components/game/BlockGrid.tsx#L219-L253
[H1]: https://github.com/haoliu-dev/block-blast-phone/blob/8cf18eb45c4c4ea7b11283d55c51369e07d11ca4/src/logic/placement.ts
[H2]: https://github.com/haoliu-dev/block-blast-phone/blob/8cf18eb45c4c4ea7b11283d55c51369e07d11ca4/src/logic/lineClear.ts
[H3]: https://github.com/haoliu-dev/block-blast-phone/blob/8cf18eb45c4c4ea7b11283d55c51369e07d11ca4/src/logic/reducer.ts
[H4]: https://github.com/haoliu-dev/block-blast-phone/blob/8cf18eb45c4c4ea7b11283d55c51369e07d11ca4/src/logic/shapes.ts
[H5]: https://github.com/haoliu-dev/block-blast-phone/blob/8cf18eb45c4c4ea7b11283d55c51369e07d11ca4/src/logic/scoring.ts
[H6]: https://github.com/haoliu-dev/block-blast-phone/blob/8cf18eb45c4c4ea7b11283d55c51369e07d11ca4/src/renderer/index.ts#L79-L167
[H7]: https://github.com/haoliu-dev/block-blast-phone/blob/8cf18eb45c4c4ea7b11283d55c51369e07d11ca4/src/storage/localStorage.ts
[H8]: https://github.com/haoliu-dev/block-blast-phone/blob/8cf18eb45c4c4ea7b11283d55c51369e07d11ca4/tests/e2e/game.spec.ts
[A1]: https://github.com/Aerse/seed-block-blast/blob/55f39ac79e6b5456c21d2adc159dc98c89593751/src/Game.ts#L689-L726
[A2]: https://github.com/Aerse/seed-block-blast/blob/55f39ac79e6b5456c21d2adc159dc98c89593751/src/constants.ts
[K1]: https://github.com/Kvc34/Block-Blast-With-Rotation/blob/4e78787b3e87cd1d8b7c5c5dad573e811200d0a4/Block_Blast_Game_With_Rotation_Kvc.html#L976-L1225
[R1]: https://github.com/danteberishaj/block-blaster/blob/3d4d5d93ed3ab3e63010132c8da8bbb09fd01134/src/game/logic.ts#L210-L332
[R2]: https://github.com/danteberishaj/block-blaster/blob/3d4d5d93ed3ab3e63010132c8da8bbb09fd01134/src/storage/storageCore.ts
[R3]: https://github.com/danteberishaj/block-blaster/blob/3d4d5d93ed3ab3e63010132c8da8bbb09fd01134/src/components/DraggableShape.tsx#L107-L150

许可原文：[Haoliu MIT](https://github.com/haoliu-dev/block-blast-phone/blob/8cf18eb45c4c4ea7b11283d55c51369e07d11ca4/LICENSE)、[MrCerise MIT](https://github.com/MrCerise/block-blast/blob/b4214881f99708b6009b48bfe839c4d28bd0ce22/LICENSE)、[blockerino MIT](https://github.com/tokaa1/blockerino/blob/488544878d4f19e16fad043450c13e5070de4689/LICENSE)、[Aerse MIT](https://github.com/Aerse/seed-block-blast/blob/55f39ac79e6b5456c21d2adc159dc98c89593751/LICENSE)、[Kvc MIT](https://github.com/Kvc34/Block-Blast-With-Rotation/blob/4e78787b3e87cd1d8b7c5c5dad573e811200d0a4/LICENSE)、[Rowflare MIT](https://github.com/danteberishaj/block-blaster/blob/3d4d5d93ed3ab3e63010132c8da8bbb09fd01134/LICENSE)。
