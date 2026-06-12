# Galaxy View（星系视图）

> Obsidian 的电影感 3D 图谱插件——像 NASA "Eyes on Asteroids" 一样飞行穿越你的第二大脑。

## 这是什么

替代 Obsidian 自带 2D Graph View 的 3D 图谱视图。当笔记达到几千篇时，2D 图既不惊艳、也难以发现节点间的关联 pattern。Galaxy View 把整库渲染成一座可飞行探索的星系：辉光节点、星空背景、缓动镜头、搜索定位飞行、闲置巡航。

**产品判断**：对 PKM 场景，颜值和可玩性本身就是生产力的一部分。但「惊艳」的来源是克制（NASA 配方：纯黑背景 + 选择性辉光 + 慢镜头），不是特效堆砌。

## 怎么跑

```bash
npm install
npm run dev      # watch 构建，输出到 ./dev-vault/.obsidian/plugins/galaxy-view/（hot-reload 自动重载）
npm run build    # 产物在 ./dist/（main.js + manifest.json + styles.css）
npm run lint     # eslint（含 obsidianmd 商店合规规则）
npm run test     # vitest
```

开发环境：本地克隆 dev vault（`./dev-vault/`，gitignored，仅含 .md 文件）——不要直接在 iCloud 真实 vault 里开发（同步 churn + 开发版可能冻住正在用的库）。重建 dev vault：

```bash
rsync -a --exclude='.obsidian/' --exclude='.trash/' --include='*/' --include='*.md' --exclude='*' \
  --prune-empty-dirs "<真实 vault 路径>/" dev-vault/
```

## 关键 tradeoff 与被否决的方案

| 决策 | 被否决的备选 | 原因 |
|---|---|---|
| 全新构建 | fork 现有 4 个 3D 插件 | 全部停更、死因相同（逐对象渲染性能墙）+ 依赖腐烂；MIT 代码作参考即可 |
| 3d-force-graph 为宿主 + 聚合渲染（1×Points + 1×LineSegments） | 库默认逐节点/逐边 Object3D | ~22.7k draw call 是前人死因；聚合后 <45 call，且点精灵 shader 正是 NASA 发光球观感 |
| three.js WebGL 基线 | WebGPU / Babylon.js / cosmos.gl | 用户 Electron 落后不可依赖 WebGPU；Babylon 无图谱生态；cosmos.gl 仅 2D |
| DOM 浮层标签 | 画布内文字（spritetext） | NASA 生产代码同款；CJK 清晰 + Obsidian CSS 变量换肤 |
| 链接 NormalBlending 低透明度 | AdditiveBlending | 1.9 万条线在枢纽核心叠加会白爆 |
| V1 默认只渲染有效链接 | 完全对齐 graph.json（含未解析） | 含未解析是 ~9.8k 节点，复刻前人死亡现场；做成性能门控开关 |

完整设计文档见 `docs/design/`（实施计划 + 架构/视觉/风险三视角）。

## 状态

M0 性能尖刺阶段——真实 vault 数据（3,230 节点 / 19,337 边）已点亮，基准进行中。进展与基准数字见 [WORKLOG.md](WORKLOG.md)。
