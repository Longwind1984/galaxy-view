# WORKLOG — Galaxy View

> append-only 时间序，倒金字塔结构：结论在前，细节沉底。

---

## 2026-06-15 · 修复社区商店自动审核失败 → 0.1.1

### 做了什么
0.1.0 提交商店后自动审核 Failed，两个 SOURCE CODE Error 是硬阻塞——**商店审核不允许用 eslint-disable 关闭 obsidianmd 规则**（我之前为让 dev 命令的中文+缩写命名过 lint 用了 disable，正好踩中）。改法不是关规则而是让代码真正合规：
1. **prefer-window-timers**（forceWorker.ts）：Worker 里没有 window，`setTimeout` 改 `self.setTimeout`（成员调用，规则只拦裸标识符，运行时在 Worker 正确）。
2. **ui/sentence-case**（main.ts ×3）：删 disable，把含 Latin 缩写（S1/S4/GC）触发规则的 dev 命令名/提示改成纯中文（这些命令商店构建已剔除，命名无所谓）。
3. **CSS !important 警告**（styles.css ×3）：`!important` 只为盖过 JS 设的内联 transform；改为移动端显示卡片时用 `removeProperty('transform')` 清掉内联，再靠 `.gx-mobile .gx-card` 选择器特异性接管 left/top/transform，三个 !important 全删。注意 `removeProperty` 是方法调用，绕开 no-static-styles-assignment（该规则只拦静态赋值）。
4. **artifact attestation**（RELEASES 建议项）：release CI 加 actions/attest-build-provenance@v2 + id-token/attestations 权限，产物可加密验证来源。
5. 版本 bump 0.1.0 → 0.1.1（审核结果绑版本，修复需新版本重新提交）。

### 审核结果对照
- SOURCE CODE 两个 Error（disable 规则）→ src 中 eslint-disable 归零
- CSS LINT 警告（!important）→ 归零
- RELEASES 建议（缺 attestation）→ CI 已加
- NETWORK Pass / BEHAVIOR Vault Enumeration 是建议项：图谱插件必须枚举文件才能建图，属固有行为，无需改动（审核仅作透明性提示）

### 当前状态
lint 0 错误 0 disable / 8 单测绿 / prod 构建 bench 命令仍剔除 / 真实 vault 已更新 0.1.1。**待 Rick 手动发布 0.1.1**（git push + tag 0.1.1 + push tag → CI 出 release → 商店重新提交，version 会自动从 0.1.0 升到 0.1.1）。

### 文件级变更清单
- 改 src/main.ts（3 处命令名/提示纯中文化 + 删 disable）、src/layout/forceWorker.ts（self.setTimeout）、src/overlay/OverlayManager.ts（removeProperty 清内联 transform）、styles.css（删 3 个 !important）、.github/workflows/release.yml（attestation）
- bump：package.json / manifest.json / versions.json → 0.1.1

---

## 2026-06-13 · M4 验收闭环 + M5 发布准备（待 Rick 确认对外发布）

### 做了什么
- **M4.1 卡片底部重叠修复（Rick iPhone 实测反馈）**：调研确认 Obsidian 移动端底部操作栏类名 `.mobile-navbar`（来自官方 app 包样式表）且**无官方高度变量**、平板/隐藏设置下可能不存在 → 采用**运行时实测**方案：卡片弹出时测量 navbar 与画布的实际重叠像素写入 `--gx-bottom-inset`，与 `safe-area-inset-bottom` 取大者。无 navbar 时实测为 0，天然不会多出空白（桌面移动模拟已验证此分支）。
- **M4 桌面验收**：移动模拟档实测——6 draw calls / 1500 节点帽 / bloom 关 / 60fps；搜索选中「概念词典」→ 底部抽屉卡片贴底无遮挡、669 条出链高亮、聚焦变暗全部正常。Rick iPhone 实测：61fps 流畅。**G4 门通过，移动端随首发**。
- **M5 准备**：`__GALAXY_DEV__` esbuild define 门控基准命令与面板 S1-S3（商店构建实测剔除、dev 构建保留）；MIT LICENSE；英文 README（商店门面）；GitHub Actions release 工作流（tag → lint+test+build → 附 main.js/manifest.json/styles.css）；官方审核自审通过（无 innerHTML / 无网络调用 / 无 JS 样式注入 / id 合规）。

### 当前状态
真实 vault = 商店版构建（无 dev 命令），dev vault = 开发版构建。**对外发布（建 GitHub repo + push + 打 tag）按协议待 Rick 确认**：repo 名 / 公开性 / 账号。确认后流程：gh repo create → push → tag 0.1.0 → CI 自动出 release → BRAT 可装 → 浸泡一周 → 商店 portal 提交（galaxy-view 查重）。

### 未尽事项
- iPhone 上的卡片避让效果待 Rick 下次同步后顺手确认（机制已在桌面验证，risk 低）。
- 商店提交时需截图/GIF 素材（README 安装节 `<github-user>` 占位待替换）。

### 文件级变更清单
- 新增 `LICENSE`、`README.md`（英文）、`.github/workflows/release.yml`、`src/typings/galaxy-dev.d.ts`
- 改 `esbuild.config.mjs`（define）、`src/main.ts`、`src/overlay/{ControlPanel,OverlayManager}.ts`（门控/自适应 inset）、`eslint.config.mts`、`styles.css`

---

## 2026-06-13 · M4 移动端：三档质量体系 + 真实 vault 安装（iPhone 实测待 Rick）

### 做了什么
- **三档质量预设**（quality/tiers.ts）：high（dpr≤2/全量/bloom 开）、low（dpr=1/星空 40%/标签 8）、mobile（dpr≤1.5/**bloom 关**——shader 热核保 80% 观感/星空 32%/**节点帽 1500**+链接帽 12k/标签 6/**仅 tap 无 hover**）。Platform.isMobile 硬上限；面板「高级→画质」可循环 自动/高/低/**移动模拟**（桌面预览移动效果）。
- **FPS 看门狗**：auto 档沉降后连续 3 次 5s 采样 <30fps → 单向降到 low + Notice，会话内不回升（避免振荡）。
- **节点/链接帽**进 buildGraph：度数榜 top N + min(端点度数) 截断 + 索引重排（含单测，共 8 个）；首次降档弹「已显示前 N 个节点」。
- **移动端卡片 = 底部抽屉**（40vh 可滚动）；**webglcontextlost 恢复**：遮罩 + 一键整体重建（Electron GPU 重置 / iOS 上下文回收都走这条路）。
- **已安装进真实 vault**（iCloud）：`.obsidian/plugins/galaxy-view/` + community-plugins.json 追加——桌面端重启 Obsidian 生效；iPhone 等 iCloud 同步完即可用。

### 验证状态
lint 0 / 8 单测绿 / 构建部署 dev vault + 真实 vault。**待 Rick**：①桌面「画质：移动模拟」预览（节点变 1500、bloom 关、点节点出底部抽屉）②iPhone 实测清单：打开不崩 → 环绕顺滑（目标 ≥25-30fps）→ tap 选中出抽屉 → 开关视图×5 → 退后台再回来正常。③不达标就按预案 isDesktopOnly 首发，移动进 V2。

### 未尽事项
- 移动端触控：OrbitControls 原生单指环绕/双指缩放平移，未额外定制；WASD/巡航速度等在手机上无意义但无害。
- 真实 vault 桌面端需重启 Obsidian 才加载插件（community-plugins.json 不热读）。
- 看门狗采样用 1s 帧窗（hudFrames），极端抖动场景可能误判——保守参数（3 连击）+ 手动覆盖兜底。

### 文件级变更清单
- 新增 `src/quality/tiers.ts`
- 改 `src/data/{buildGraph,GraphStore}.ts`（caps）、`src/render/{AggregateRenderer(applyTier),starfield(scale)}.ts`、`src/view/{GraphController(pickTier/watchdog/contextlost),GalaxyView(rebuild)}.ts`、`src/overlay/{ControlPanel(画质),OverlayManager(预算/抽屉)}.ts`、`src/settings.ts`（qualityOverride）、`styles.css`、`tests/buildGraph.test.ts`

---

## 2026-06-13 · M2.6 + M3：六项体验迭代 + Worker 布局正式化（冷布局主线程阻塞归零）

### 做了什么
**M2.6（Rick 六条反馈）**：①六组配色主题（哈勃深空/抖音霓虹/落日胶片/赛博都市/黑客帝国/极光，按黑底呈现挑选；无颜色组的库自动按文件夹生成）+保留洗牌 ②「回中心」按钮与 R 键统一（清选中+回总览+到达即巡航——解决「不知道在绕谁转」）③亮星眨眼（仅最亮 3% 真星、同时最多一颗、泊松间隔+1.6s 包络；频率滑杆可关）④创世动画（节点从中心按半径波次绽放 2.6s，开页自动播+面板手动按钮；复用暖启动坐标，无需预计算）⑤孤儿节点开关（含边索引重排）⑥节点大小依据三模式：链接数/文档量（∛压缩长尾）/一致。

**M3（性能硬化）**：WorkerForceLayout——d3-force-3d 完全离主线程（Blob URL Worker + esbuild inline-worker 插件；坐标 transferable 双缓冲乒乓，主线程每帧仅 38KB memcpy；worker 批量 tick 每批≤12ms）；创建失败回退主线程实现；LayoutEngine.ticks 正式计数器（删 bench hack）；修正 M2 起 S2 的 alpha 语义偏差（冷布局回 alpha=1）；**uMaxPoint 点精灵钳制 110dp**——实测抓到穿行星团内部 8fps 的填充率瓶颈并修复。

### M3 基准（同机同库，Worker 布局）

| 场景 | M0 stock | M1 聚合(主线程) | **M3 聚合+Worker** |
|---|---|---|---|
| S1 环绕 | 16.2 fps | 60.0 fps | **60.0 fps** (p95 17.7ms) |
| S2 冷布局 | 61s 饱和/最长 860ms | 5.2s/最长 64ms | **5.8s/阻塞 0 次 0ms** ✅ |
| S3 含未解析 | 13.8 fps | 60.0 fps | **60.0 fps** |
| S4 泄漏×10 | +13.7MB | -1.0MB | **-3.7MB**（Worker 销毁干净） ✅ |

布局期间编辑笔记零卡顿成为架构保证（不再只是「够快」）。G3 门通过：未解析开关可上桌面版；移动端（M4）go。

### 未尽事项
- 穿行星团时 8fps 已被钳制缓解，但极端情况（烟火预设+满屏 bloom）仍可能掉帧——M4 质量档位的 desktop-low 自动降档兜底。
- 配色主题应用会覆盖颜色组的色值（保查询）；「导入二维配色」可随时还原。
- 监控脚本教训：zsh 循环里裸 glob 在无匹配时直接报错退出——下次 setopt null_glob。

### 文件级变更清单
- 新增 `src/render/colorThemes.ts`、`src/layout/{forceWorker,WorkerForceLayout}.ts`、`src/typings/inline-worker.d.ts`
- 改 `esbuild.config.mjs`（inline-worker 插件）、`src/render/{starfield(Twinkler),AggregateRenderer(reveal/sizeMode/twinkle/uMaxPoint),shaders}.ts`、`src/layout/{LayoutEngine,MainThreadForceLayout}.ts`（ticks）、`src/view/GraphController.ts`（recenter/主题/引擎选择回退/bench 修正）、`src/overlay/ControlPanel.ts`、`src/{settings,types}.ts`、`src/data/{buildGraph,GraphStore}.ts`（孤儿/fileSize）、`styles.css`、`tests/buildGraph.test.ts`（7 测试）

---

## 2026-06-12 · M2.5 优化轮：风格预设（含扁平银河）+ 即时环绕 + 面板 v3 + 修 bug（Rick 六条反馈）

### 做了什么
1. **风格预设 chips**（辉光+力学+外观成套）：「银河」扁平星盘（新出厂默认，Y 轴压扁力 flatten=0.3——自然引斥力做不出盘，这是必要的额外力）/「星云」自然球体 /「极简」零辉光看结构 /「烟火」高辉光炫技。默认辉光整体调温和（0.6→0.35），新用户第一印象优先。
2. **飞达即环绕**：选中飞行到达后立即绕节点旋转（不再等 10s 闲置），且旋转方向**优先扫过邻居质心所在的半球**（5 条链接 4 条朝南→先划过南方）。
3. **面板 v3 信息架构**：常用置顶（搜索/巡航/风格 chips），细调收进折叠分区（辉光/力学/外观与配色/巡航/高级），默认全收——首屏极简。新增：扁平度滑杆、巡航速度滑杆、配色洗牌（九组颜色互换）、链接透明度限位降到 0。
4. **修 bug**：选中卡片 z-index 置顶（不再被枢纽标签遮挡）；晨昼链接从纯黑换暖铅笔灰 #8d8678。
5. **macOS 平移修复**：Ctrl+点击被 macOS 征用为系统右键模拟（这是 Rick「Ctrl+拖没反应」的根因，非触控板问题）——平移改为 **⌘+左键拖 / Shift+左键拖 / 右键拖** 三通道，操作说明已更新。

### 验证状态
lint 0 错 / 5 单测绿 / 构建部署完成。**运行时未实机验证**（Obsidian 窗口已被 Rick 关闭，不再抢屏）——Rick 下次打开自查清单：①面板首屏应只有搜索/巡航/四个风格 chips+折叠区 ②点「银河」看星系压成盘（约 5s 重排）③点节点飞达后应立即开始环绕 ④卡片不再被文字遮挡 ⑤⌘+拖平移。

### 未尽事项
- 风格 chips 当前无「激活态记忆」（刷新后不高亮上次选的预设）——刻意从简，预设是「应用动作」而非「状态」。
- 扁平银河的盘面厚度/转轴方向未做参数化（转轴恒为 Y）；若 Rick 想要倾斜盘面再加。
- G2 门（深空 vs 晨昼默认方向）仍待 Rick 在浅色主题下裁决。

### 文件级变更清单
- 新增 `src/render/stylePresets.ts`
- 改 `src/settings.ts`（flatten/cruiseSpeed/新默认）、`src/types.ts` + `src/layout/MainThreadForceLayout.ts`（Y 轴压扁力）、`src/render/presets.ts`（晨昼链接色）、`src/interactions/CameraDirector.ts`（beginFocusOrbit/密集侧方向/⌘⇧平移/巡航速度）、`src/view/GraphController.ts`（预设应用/洗牌/密集方向计算）、`src/overlay/ControlPanel.ts`（v3 重组）、`styles.css`（z-index/chips/折叠区）

---

## 2026-06-12 · M2 主体落地：控制面板重设计 + 3D 交互自由度 + 四件套 + 双视觉方向（G2 待 Rick 裁决）

### 做了什么
响应 Rick 三条反馈并执行 M2 全量：
1. **滑杆重做（Lightroom 式）**：默认值锚定轨道几何中心（左右半轴分段线性映射）、中心刻痕标默认位、轨道两端常驻 min/max 限位值、从刻痕到滑块的偏离填充条、**双击回默认**、当前值=默认时读数变淡。
2. **3D 交互自由度**：左键拖环绕（基底）+ **右键/Ctrl(⌘)+左键拖平移**（Google Earth 式）+ **WASD/QE 飞行**（速度随离目标距离自适应、Shift×3）+ F 飞向选中 + R 平滑回总览 + ESC 取消选中；按键仅画布聚焦时生效；面板新增「操作说明」折叠区。
3. **M2 四件套**：graph.json 九组真配色自动导入（int→hex、trim 尾随空格、path: 前缀首匹配；可手动重导）；SuggestModal 模糊搜索→选中+飞行（空查询=枢纽 top20「星座导览」）；DOM 浮层（top-14 枢纽常驻标签距离淡出 + hover 标签 + 选中卡片：路径色点/出入链/修改日期/异步摘要/打开笔记/聚焦）；聚焦模式（非邻居 280ms 淡出至 0.12 + 选中链接独立高亮层 + 主链接网压暗）。
4. **双视觉方向**（G2 门的料）：token 全部集中 presets.ts——A「深空」恒暗；B「随主题」深色共用 A、浅色「晨昼制图室」（暖纸底/尘埃微粒替星空/bloom 强制关/墨水节点带 rim/铅笔链接/NoToneMapping）；css-change 自动切换；面板一键 A/B。
5. **暖启动 + 开场镜头**：沉降坐标缓存进 data.json（覆盖率≥80% 时重开秒成形 + alpha 0.06 轻整理），暖启动时播放「构建星图…」遮罩 → 600ms 揭幕 → 镜头从图内部 3.2s 拉出 + 辉光 1.8×→设置值回落；冷启动直接看星系成形动画。

### 已验证（Obsidian 实机）
新面板渲染正确（限位/刻痕/分区/按钮全在）、61fps/19-20 calls 保持、九组真配色生效（04AI 绿团、Cubox 橙团肉眼可辨）、枢纽标签浮现、设置持久化（面板载入 Rick 自调的辉光值）、点击→飞行→卡片（含异步摘要）→聚焦变暗→选中链接高亮全链路 OK。lint 0 错 / 5 单测绿 / 624KB。

### 未尽事项（G2 与 M3 入口）
- **G2 门待 Rick**：app 切浅色主题 + 面板「视觉：随主题」→ 对比晨昼制图室 vs 深空，用眼睛定默认方向。
- WASD 飞行/Ctrl 平移/搜索弹窗/R 回总览未实机验证（键盘交互不便远程模拟）——Rick 上手 1 分钟即可覆盖。
- 晨昼模式只在代码层完成，未实机看过（需切浅色主题）；微粒漂移动画是简化版（仅旋转）。
- S2 基准现在会先清空暖启动缓存再跑（保证冷布局语义）。
- bench 的 layout.step 运行时替换 hack 仍在（M3 改正式钩子）。

### 文件级变更清单
- 新增 `src/overlay/{Slider,OverlayManager}.ts`、`src/settings/graphJsonImport.ts`、`src/render/presets.ts`、`src/view/SearchModal.ts`
- 重写 `src/overlay/ControlPanel.ts`、`src/render/{AggregateRenderer,shaders}.ts`（聚焦 aDim/选中高亮层/tokens/晨昼 shader 变体/motes）、`src/interactions/CameraDirector.ts`（飞行/平移/F/R）、`src/view/GraphController.ts`（全量接线）、`styles.css`
- 改 `src/{settings,types,constants}.ts`（preset/colorGroups/positionCache/showUnresolved、in/outDegree）、`src/data/buildGraph.ts`、`src/layout/*`（initialAlpha）、`src/view/GalaxyView.ts`（css-change 转发）、`src/main.ts`（搜索命令）

---

## 2026-06-12 · M1.5 控制面板：响应 G1 反馈（辉光过曝 + 可玩性不足）

### 做了什么
Rick 看过 M1 后给出两条反馈：辉光太耀眼看不清内部结构；控制器太弱想要力学参数可玩。落地：左上角暗玻璃**控制面板**——辉光（强度/扩散/阈值）、力学（斥力/链接距离/链接强度/向心力，拖动时布局实时重热、星系当场重排）、外观（节点大小/链接透明度）、巡航开关、重置默认；**全部参数持久化**到插件 data.json（防抖 800ms 写盘），重启不丢。基准按钮收进折叠的「基准（开发）」区。默认辉光调温和：strength 0.9→0.6、radius 0.45→0.4、threshold 0.1→**0.18**（阈值是解决「看不清结构」的关键——只有亮核与亮星过线发光，内部链接网不再被淹没）。

### 关键决策
- 链接强度做成 d3 默认值（1/min(端点度数)）之上的**倍率**而非绝对值——保留「枢纽不被拉爆」的自适应特性，滑杆语义仍直观。
- 力学滑杆 input 即 updateParams + reheat(0.5)：重排过程本身是可玩性（拖斥力看星系呼吸）。
- 设置经 SettingsHost 接口注入视图，避免 main.ts 循环依赖；mergeSettings 对脏数据逐字段防御。

### 当前状态
lint/build/单测全绿，已部署 dev vault。**视觉验证被锁屏打断**——Rick 解锁后验证路径：打开星系视图 → 左上面板拖「阈值」滑杆右移看结构浮现 → 拖「斥力」看星系实时重排 → 关闭重开 Obsidian 确认参数保持。

### 未尽事项
- 面板视觉是草案（暗玻璃方向 A 风格），Rick 看过后再定稿；浅色主题适配在 M2 双方向里一并做。
- bench S2 场景在面板调参后会用当前力学参数（不再是固定默认）——跑对比基准前先「重置默认」。

### 文件级变更清单
- 新增 `src/settings.ts`（GalaxySettings/默认值/merge/SettingsHost）、`src/overlay/ControlPanel.ts`
- 改 `src/{main,types,constants}.ts`、`src/view/{GalaxyView,GraphController}.ts`、`src/layout/{LayoutEngine,MainThreadForceLayout}.ts`（updateParams + linkStrength 倍率）、`src/render/{AggregateRenderer,shaders}.ts`（setBloomParams/setLinkOpacity/uSizeMul）、`styles.css`（面板样式替换旧 HUD）

---

## 2026-06-12 · M1 聚合渲染器落地：16fps → 60fps（vsync 顶满），G0 红色问题全部清除

### 做了什么
按 G0 红色预案，把聚合渲染从 M3 提前落地：**全部 3,230 节点 = 1 次 draw call（THREE.Points + 发光球 shader），全部 19,337 条链接 = 1 次 draw call（LineSegments）**，整帧含 bloom 仅 19 calls（M0 是 ~22,000）。彻底移除 3d-force-graph 运行时依赖（自有 three.js 管线 + 直驱 d3-force-3d），包体 1.3MB → 606KB。布局改为预算化（每帧 1 tick）——星系成形过程本身成了开场动画，期间 Obsidian 全程可用。T1 交互齐活：点击节点镜头飞行（15° 方位偏移 + easeInOutCubic）、闲置 10s 自动巡航（不可通约双周期漂移）、辉光强度滑杆、星空背景。

### before/after（同机同库，G 门判据）

| 场景 | M0 stock 3d-force-graph | M1 聚合渲染 | 判定 |
|---|---|---|---|
| S1 沉降后环绕 (bloom on) | 16.2 fps · p95 83ms | **60.0 fps（vsync 顶满）· p95 17.5ms** | ✅ ≥45 |
| S2 冷布局 | 61.2s 主线程饱和（阻塞 60.7s，最长 860ms） | **5.2s 沉降 · 仅 1 个 longtask 64ms** | ✅ 无 >200ms 阻塞 |
| S3 含未解析 (9,437n) | 13.8 fps | **60.0 fps** | ✅「显示未解析」可以上桌面版 |
| draw calls | ~22,000 | **19** | ✅ 预算 <45 |
| S4 泄漏 ×10 | +13.7MB | **-1.0MB**（堆比开始还低） | ✅ 零泄漏 |

S4 插曲：首测 +181MB 触发红灯——连续两轮对照证明是 **GC 滞后**而非真泄漏（第二轮起始堆回落到 123MB < 第一轮起始 130MB；根源是 d3 每 tick 重建八叉树产生的海量短命垃圾，忙循环期间 major GC 不跑）。修正测量方法（结束后等 20s 空闲 GC）后终判 -1.0MB。教训已写进 S4 的 note 字段：**真泄漏判据 = 连续多轮起始堆持续抬升，单轮 delta 不可信**。

### 关键决策与被否决的备选
- **彻底弃用 3d-force-graph 运行时**（原计划降级为「布局壳」保留）：聚合渲染既然自有场景，直驱 d3-force-3d 比 fx/fy/fz 回写 hack 更简单——顺带消灭了风险表 R7（全设计唯一未验证机制）。库留在 devDeps 仅作参考。
- **布局预算化（每帧 1 tick）而非一次跑完**：300 tick × 60fps ≈ 5s 成形动画，替代「卡死 61 秒」；Worker（M3）从救命稻草降级为大库优化项。
- 白爆修复验证：去饱和细线 + NormalBlending 0.16 + bloom 阈值 0.1，枢纽核心不再一团白。

### 当前状态
dev vault 里即点即用：打开星系视图 → 5 秒星系成形 → 60fps 巡航/飞行/辉光调节。单测 5 个全绿（buildGraph 纯函数），lint 0 错误（含商店合规规则）。

### 未尽事项与已知问题
- **G1 门待 Rick 肉眼判定**：「已经像 NASA Eyes 了吗？」不像就先修 T1 再进 M2。
- 配色当前是按文件夹 hash 的回退调色板，不是 Rick 的 9 组真配色——graph.json 导入在 M2。
- 开场镜头（从图内拉出 3.2s）、hover 标签、选中卡片、搜索 = M2 四件套。
- 巡航半径会缓慢漂移（呼吸周期与 OrbitControls damping 轻微互动）——M2 镜头打磨时一并处理。
- S2 的 layout.step 计数用了运行时方法替换（hack）——M3 给 LayoutEngine 加正式 tick 钩子。

### 文件级变更清单
- 删 `src/spike/`；新 `src/{constants,types}.ts`、`src/data/{buildGraph,GraphStore,seed}.ts`、`src/layout/{LayoutEngine,MainThreadForceLayout}.ts`、`src/render/{AggregateRenderer,shaders,starfield,palette}.ts`、`src/interactions/CameraDirector.ts`、`src/view/{GalaxyView,GraphController}.ts`、`src/bench/bench.ts`（移动）、`src/typings/d3-force-3d.d.ts`、`tests/buildGraph.test.ts`
- tsconfig include tests；eslint ignore dev-vault；M0 基准 JSON 归档至 /tmp/galaxy-bench-archive

---

## 2026-06-12 · 立项 + M0 性能尖刺：G0 判定红色，聚合渲染提前到 M1

### 做了什么
立项「Galaxy View」（Obsidian 电影感 3D 图谱插件，NASA Eyes 风格）。完成 5 路并行技术调研、3 视角设计（架构/视觉/风险）、实施计划获 Rick 批准；搭好仓库脚手架 + 本地 dev vault 开发环境；用真实 vault 数据（3,230 笔记 / 19,337 有效边）跑通 stock 3d-force-graph + bloom 的性能尖刺，**拿到了 G0 决策门的全部基准数字**。

### 关键决策与被否决的备选
- **G0 判定：红色**（S1 16.2fps < 30fps 红线）→ 按预案，聚合渲染（1×THREE.Points 节点 + 1×LineSegments 链接）从 M3 提前到 **M1 立即实施**；3d-force-graph 降级为布局/相机/交互壳。这不是危机，是计划内分支——四个前人插件全部死于逐对象渲染墙，我们用 3 小时验证了同一堵墙。
- **Worker 布局确认必做**（S2：布局期间主线程饱和 61 秒，Obsidian 整体不可用）。
- **「显示未解析」默认关闭**（S3 含未解析 9,437 节点 13.8fps）；聚合渲染落地后重新基准再决定开关去留。
- 立项阶段决策详见 docs/design/00-实施计划.md（不 fork、技术栈、双视觉方向、里程碑门等）。

### 当前状态：现在能跑什么
- `npm run dev` → 构建直出 `dev-vault/.obsidian/plugins/galaxy-view/`，hot-reload 自动重载。
- Obsidian 打开 `dev-vault/`（已注册），命令面板：「打开星系视图」「M0 基准：依次跑 S1/S2/S3」「S4 泄漏金丝雀」。
- 视图已可渲染整库 + bloom + 按文件夹着色；HUD 显示 fps/节点数/布局状态。

### M0 基准数字（G0 决策依据，机器：Rick 的 Mac，Obsidian 1.12.7）

| 场景 | 规模 | 结果 | 判定 |
|---|---|---|---|
| S1 沉降后 20s 环绕（bloom on） | 3,230n / 19,337l | **16.2 avg fps**，p95 帧 83ms | 🔴 <30 红线 |
| S2 冷启动布局 | 同上 | 沉降 61.2s（撞 60s 上限）、459 tick、平均 133ms/tick、**longtask 累计 60.7s**、最长单块 860ms | 🔴 主线程饱和 |
| S3 含未解析 | 9,437n / 26,975l | 13.8 avg fps | 🔴 默认关闭 |
| S4 泄漏金丝雀 ×10 | 3,230n / 19,337l | 堆增量 **+13.7MB**（262.8→276.5），无 context 告警 | ✅ <20MB 通过 |

注：HUD 的 drawCalls 在 EffectComposer 下读数无效（读到的是最后一个 pass 的 1 次全屏 quad），实际为逐对象 ~22k call——下次用 spector.js 或在 composer 前读数。

### 未尽事项与已知问题
- 真实边数 19,337（调研估 19.5k，命中）；vault 比调研时多 5 篇笔记。
- 视觉验证了两个预测的失败模式：枢纽白爆（中心一团白）、布局未沉降时节点外飞——聚合渲染 + 开场遮罩分别对应。
- Obsidian 桌面版实际为 1.12.7（非调研所称 1.13.1 最新），minAppVersion 1.7.2 不受影响。
- iCloud 真实 vault 完全未被触碰（只读 rsync）；dev vault 在 `./dev-vault/`（gitignored）。

### 文件级变更清单
- 新仓库 `/Users/rick/Claude_Code/Galaxy_View/`：sample-plugin 模板（esbuild/TS/eslint-obsidianmd/vitest）+ deps（three 0.184 / 3d-force-graph 1.80 / d3-force-3d 3.0.6 / three-spritetext 1.10）
- `src/main.ts`（插件入口 + 3 命令 + S4）、`src/types.ts`、`src/spike/{SpikeView,buildGraphData,bench}.ts`、`styles.css`（HUD）
- `docs/design/`：实施计划 + 架构/视觉/风险三份设计全文
- `README.zh.md`、`.gitignore`、`manifest.json`（id: galaxy-view，minAppVersion 1.7.2）
- dev vault：`dev-vault/`（3,230 md 克隆 + hot-reload 0.3.0 + galaxy-view 0.1.0 已启用）
