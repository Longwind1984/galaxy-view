# WORKLOG — Galaxy View

> append-only 时间序，倒金字塔结构：结论在前，细节沉底。

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
