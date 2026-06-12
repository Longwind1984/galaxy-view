# WORKLOG — Galaxy View

> append-only 时间序，倒金字塔结构：结论在前，细节沉底。

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
| S4 泄漏 ×10 | +13.7MB | （本条目内补） | — |

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
