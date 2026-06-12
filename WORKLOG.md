# WORKLOG — Galaxy View

> append-only 时间序，倒金字塔结构：结论在前，细节沉底。

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
