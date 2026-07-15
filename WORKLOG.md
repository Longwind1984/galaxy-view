# WORKLOG — Galaxy View

> append-only 时间序，倒金字塔结构：结论在前，细节沉底。

---

## 2026-07-16（四）· 合并后的 main 首次回归验证（定时自主轮，仅验证未改码）

### 做了什么
PR #12（#9 居中）与 PR #13（#11 图例过滤）昨夜 23:33/23:34 先后合入 main，两条分支各自绿过，**但合并后的 main 从没被跑过**——两个分支都动了渲染层（#12 改 `AggregateRenderer` 取坐标，#13 改 `GraphController` 的 `applyColorFn` 收口），语义冲突不会被 git 报出来。本轮补跑这道缺失的回归，未改任何代码。

### 结论：main 干净，发布路径通
- `npx vitest run` → **77 测试全绿 / 8 文件**（graphTransform 4 + palette 9 + noteFilter 23 + buildGraph 11 + adjacency 9 + settingsMerge 8 + linkCurves 7 + tour 6）
- `npx tsc -noEmit -skipLibCheck` → **exit 0**
- `npx eslint .` → **0 error**（2 warning 均为既有：eslint config 的 `config` 弃用提示、SettingsTab 未采用 1.13 声明式设置 API）
- `npm run build`（tsc + esbuild production）→ **通过**，产出 `dist/main.js` 797KB + manifest/styles。**发版的构建路径本身没问题**，卡点纯在眼验与授权。

### 眼验清单可以缩短一项（②已被机器覆盖）
上一条 WORKLOG 留给 Rick 的 7 项手动清单里，**② 「99Archive / 90故纸堆 / Readwise 现在是三个不同颜色」不必再靠肉眼**——`tests/palette.test.ts` 用 Rick 真实库数据做回归，已确定性断言：三者两两不同（:65-67）、且色值精确到 `#eca2a2` 这类**按 three 实测取的出处值**（:73），另有「≤9 个全不撞」「>9 个回收色相时撞最小的几个」「被 colorGroups 覆盖的不占槽」等 9 条。**故 Rick 手动只需过 ①③④⑤⑥⑦ 六项**（面板列出 14 个文件夹、点 chip 灭星、hover「只看」、「全部显示」的出现条件、`-file:Index` 与图例 AND、重启后状态持久）——这六项都是 Obsidian 内的真实交互，测试覆盖不到。

### 未尽事项与已知问题（本轮未动，全部卡在人）
- **0.4.1 仍未发**：manifest 还是 0.4.0，商店无推送。发版＝bump → 合 main → 打 tag → CI，属**对外发布，须 Rick 确认**，且不该在眼验前发（#9/#11 都是视觉改动，测试绿 ≠ 看起来对）。
- **眼验仍未做**：computer-use 授权被拒；插件跑在 Obsidian（Electron），浏览器预览替代不了。`demo/*.html` 是手搓的近似预览、色值靠人工从 three 抄进去（曾算错一次），**不能拿它当眼验证据**。
- 压着的两条回复（PR #10 回复+关闭、issue #9 关闭）跟着发版走；issue #11 的过时口径回复待 Rick 授权。
- Tag Lens（#7 / PR #8）等 @tzhengus 回话；issue #6 鼠标残影等复现信息。

### 文件级变更清单
仅本文件与 `docs/社区巡检.md`（记录验证结果）。**零代码改动**，`dist/` 为构建产物（gitignored）。

---

## 2026-07-15（三）· 推翻过滤的产品判断：改为可点的文件夹图例 + 修掉配色撞色

### 做了什么
Rick 一句「过滤要做可视化操作啊，你这样纯函数谁会用。反思这个决策逻辑。不能局限在用户原声思考产品问题」把上一版打回。**上一版的文本框方案作废**，重做为**可点的文件夹图例**（提交 47215ae）。顺带修掉一个查出来的既有缺陷：配色撞色。

### 反思：决策逻辑错在哪（这条比代码重要）
1. **把提出者的机制当成了目的**。SotS1689 写 `-file:"Index"`——那是他**已知的机制**（Obsidian 搜索语法），不是他的**目的**（别让索引类笔记糊住图）。我把机制照抄成了规格。
2. **把错误框架公开固化**。我在 issue #11 的回复里问他「该对齐 Obsidian 搜索语法还是核心 Graph View 的语法」——问的是**用哪套语法**，从没问**要不要语法**。而且已经发出去了，等于把框架错误传染给用户。
3. **代码接缝把错误合理化**。`buildGraph(files)` 前挂个过滤器太顺手，我还夸它「零渲染层耦合、可单测」——那是**工程美德**，被我当成了**产品美德**。接缝越干净越没去质疑接缝上面该放什么。
4. **给 Rick 的 A/B 是假开放**。两个选项都预设了文本框，让他选墙刷什么颜色，而真问题是这面墙砌错了地方。比不问更糟——它**看起来**像开放了设计空间。
5. **无视介质**。这是个主张「看见你的库」的电影感 3D 星图，让用户背 `-file:` 是这个介质里最反视觉的答案。
6. **最刺眼**：tzhengus 在 PR #8 里已经把对的范式递到手上了（Tag Lens＝点 chip → 高亮匹配、调暗其余）。我**同一个会话里亲手审了那个 PR、还写了段话夸他的 UX 推理**，然后转头给隔壁的同一个问题做了个文本框。

### 关键决策与被否决的备选
- **图例即过滤器**（Rick 在活的 demo 上从 A/B 里选了 A）：节点一直按顶层文件夹上色，但**面板从来没暴露过图例**——用户看见一团团彩色，既不知道颜色什么意思、也没法对它做任何事。把图例做成可点的，一个东西同时回答两个问题，且用的是插件本来就在算的数据。被否决＝方向 B「图上右键节点直接操作」（最直接、面板零占用，但可发现性差且仍然没有图例）。
- **文本框不删，降级为折叠的逃生口**：SotS1689 的真实场景（Index 散落在所有文件夹里）是**横切**的，图例表达不了。它是正当的兜底，只是之前被我当成了全部。`noteFilter.ts` 的解析器与 17 个测试原样保留。
- **随图例一起修撞色**（Rick 拍板）：不修就是开了个「五个点一个颜色」的图例。被否决＝单开 issue later（图例会把缺陷直接摆到用户眼前）。

### 撞色缺陷（既有，非本次引入）
回退色相原本 `HUES[hash32(folder) % 9]`——与文件夹大小无关且乱序。**实测 Rick 的库**：14 个顶层文件夹、9 个从 2D 图谱导入的配色组，剩 5 个走回退 → **99Archive(545) / 90故纸堆(86) / Readwise(68) 撞成同一个蓝**，合计 **1184 篇＝全库 37%** 落在读不出区别的颜色上。
修法：① 色相按笔记数排名发；② **只发给没被 colorGroups 吃掉的文件夹**（Rick 的 9 个导入组不占槽位 → 剩 5 个正好各拿一个独立色相）。>9 个待发时仍回收色轮，但撞的是最小的几个而非最大的。测试用真实库数据当回归用例。

### 当前状态
分支 `fix/graph-fit`（现含三个提交：#9 居中修复 / #11 文本框版 / #11 图例重做）：**77 测试通过 / tsc 通过 / lint 0 error**，已部署 dev-vault。main 未动，0.4.1 与 0.5.0 均未发。

### 未尽事项与已知问题
- **⚠️ 面板渲染仍未眼验**：computer-use 授权被拒。**Rick 手动确认清单**：① 面板顶部「过滤」分区列出 14 个文件夹，颜色点与图里节点一致；② **99Archive / 90故纸堆 / Readwise 现在是三个不同颜色**（这是撞色修复的验收点）；③ 点 chip → 该文件夹的星消失、头部笔记数变；④ hover 出「只看」，点了只剩一个文件夹，再点还原；⑤ 有点灭的文件夹时标题右侧才出现「全部显示」；⑥「＋ 按名字过滤」展开后打 `-file:Index` 仍生效、与图例是 AND；⑦ 重启后图例状态与查询都还在。
- **⚠️ 已发出的 issue #11 回复口径已过时**：那条问的是「对齐哪套语法」，而现在语法已降级为逃生口。**需要补一条回复**说明改成了点击式图例（且这次别再犯——先想清楚再发）。**待 Rick 授权**。
- **demo 的色值我算错过一次**：先前用 python 朴素 HSL→RGB 算 hash 回退色，与 three 实际不符（`setHSL` 在线性空间算再转 sRGB，真实是 `#eca2a2` 这类而非 `#d65b5b`）。撞色结论不受影响，色值已按 three 实测更正。**教训：颜色也是「具体数值」，要有出处**。
- 德/意/西/葡四语的新文案仍是我译的，无母语校验。
- 图例只到**顶层**文件夹；深层结构表达不了。14 个文件夹已占掉不少面板高度，文件夹更多的库会更挤（未做滚动/折叠）。
- 0.4.1 仍卡在 #9 的眼验；压着的两条回复（PR #10、关闭 #9）跟着卡。

### 文件级变更清单
- 新增：`tests/palette.test.ts`（9 测试，含 Rick 真实库的撞色回归）
- 改动：`src/data/noteFilter.ts`（`FilterQuery`→`NoteFilter{hiddenFolders,query}`；+`passesFilter`/`applyFilter`/`isFilterActive`/`folderStats`；`filterFiles` 并入 `applyFilter`）、`src/data/buildGraph.ts`（导出 `topFolder`）、`src/render/palette.ts`（+`assignFolderHues` 排名发色相、+`folderCoveredByGroups`）、`GraphStore`（+`folders` 图例数据 / `setHiddenFolders`；rebuild 先算全量 folderStats 再过滤）、`ControlPanel`（`buildFilterSection` 重做＝图例 chips + 折叠逃生口；+`refreshFolders`/`applyHidden`；回调 +`onHiddenFolders`/`getFolders`/`folderColorHex`）、`GraphController`（+`applyColorFn` 收口 6 处 setColorFn 并发色相、+`folderHex` 探针取色、+`colorFn` 字段）、`settings`（+`hiddenFolders` + merge 兼容）、`styles.css`（+`.gx-folder*`/`.gx-filter-esc*`）、`i18n×6`（+`filter.all/solo/soloTip/rootFolder/byName`）、`README×2`（改写为点击式图例，语法表降级到「按名字过滤」小节）、`tests/noteFilter.test.ts`（+6 图例测试）
- `demo/filter-demo.html`：A/B 决策工具 → 精简为最终形态预览（删方向 B、色值按 three 实测更正）

## 2026-07-15（续）· 0.5.0 起步：笔记过滤 #11（代码完成，未眼验）

### 做了什么
巡检的 4 条回复发出去后，接 0.5.0。表上两项里 Tag Lens 卡在等 @tzhengus 回话，能动的只有 **#11 笔记过滤**，已完成（分支 `fix/graph-fit`，提交 f7b60b6）。

面板新增**「过滤」分区并置顶**，查询框 + 未解析/孤儿/标签三个开关从页脚「高级」搬上来同住。语法是 core Search 的子集：裸词 / `file:` / `path:` / `-` 取反 / `"引号短语"` / 隐式 AND。

### 关键决策与被否决的备选
- **面板 IA 走「方向 B·提升」**（Rick 在活的 A/B demo 上拍板）：那三个开关本质就是过滤器（决定什么进图），不该和画质一起埋在页脚折叠区；搬完「高级」只剩画质这类真·高级项。被否决＝方向 A「过滤框塞进高级、什么都不搬」（零破坏，但把主功能埋在默认折叠的页脚）。代价：动了老用户熟悉的位置。
- **不做正文搜索**（核心 Graph View 有，我们没有）：那要每次按键读全库正文，3.2k 笔记做不到即时反馈，撞性能纪律。**这是与核心 Graph View 的真实能力差**，已在两份 README 里写明边界，不假装等同。
- **不做 regex / OR / 括号 / `tag:`**：无真实用例（YAGNI）。`tag:` 还会和既有 `showTags` 的语义纠缠。
- **过滤器做成 buildGraph 之前的纯函数**（`src/data/noteFilter.ts`，`FileRecord[] → FileRecord[]`）：被滤掉的笔记连同指向它的边自然消失（buildGraph 靠 `indexById` 查不到就丢边），故零渲染层耦合、可单测。TFile 结构上已满足 `FilterableRecord`，**先过滤再 map** —— 被滤掉的笔记不付 `getFileCache` 的钱也不进对象分配。
- **300ms 防抖**：每次生效要重建图 + 重热布局，逐键会打死大库。另外解析后**比较词表而非原串**，`file:a` 与 `file:  a` 语义相同就不白重建。空查询直接返回原数组不复制。
- **文案克制（偏离了 demo）**：demo 里有「显示 8/11 篇」，实现时删了——面板头部本来就在显示笔记数，查询框里有字本身就是「过滤生效中」的信号，那行属重复文案。placeholder 也不写「过滤笔记…」（分区标题已经说了），改成一个可用的真实查询 `Index  -file:Draft` 把语法教掉，完整语法进 `title` 悬浮。**只保留零匹配提示**——整个 3D 视图空掉会像崩了，这个不属于「用户简单一试即可低成本发现」。
- **`filter.syntax` 没进常驻「?」帮助**：那个帮助的标题是「How to navigate」，是讲导航手势的，塞面板语法进去是硬撑它的范围。

### 当前状态
分支 `fix/graph-fit`（现含 0.4.1 的 #9 修复 + #11 过滤两个提交）：**62 测试通过 / tsc 通过 / lint 0 error**，已 `npm run dev` 部署到 dev-vault。main 未动，0.4.1 与 0.5.0 都未发。

### 未尽事项与已知问题
- **⚠️ 面板渲染未眼验**：computer-use 请求 Obsidian 授权被拒，两次改动（#9 居中、#11 过滤分区）都只有静态校验。**Rick 手动确认清单**：① 面板顶部出现「过滤」分区且默认展开；② 三个开关已从「高级」消失、出现在「过滤」里，「高级」只剩画质 + fps 行；③ 输入 `-file:Index` 后图变少、头部笔记数跟着变；④ 输入乱码（零匹配）时出现橙色「没有笔记匹配这个过滤」而不是静默空图；⑤ ✕ 清空按钮、输入框内按 Esc 清空且不会取消节点选中；⑥ 重启 Obsidian 后过滤查询仍在（持久化）。
- **德/意/西/葡四语的过滤文案是我译的**，无母语校验（0.2.2 的六语是走 workflow + 母语 QA 出的，这次没有）。有错等社区报。
- **过滤 + 布局的交互未实测**：过滤后节点集变化 → 走既有的身份保持合并 + 0.3 低温重热路径。理论上正确（与 showOrphans 切换同路径），但大库上连打关键词反复重热的观感没测过。
- 0.4.1 仍卡在 #9 的眼验；两条压着没发的回复（PR #10、关闭 #9）也跟着卡。

### 文件级变更清单
- 新增：`src/data/noteFilter.ts`（解析器 + 匹配器，纯函数）、`tests/noteFilter.test.ts`（17 测试）
- 改动：`GraphStore`（+`filterQuery` 字段 / `setFilterQuery` / `isFiltered` / init 加参 / rebuild 先过滤后 map / `sameQuery` 词表比较）、`ControlPanel`（+`buildFilterSection` 置顶分区、三个开关从 advBody 迁出、+`setFilterEmpty`、回调 +`onFilter`）、`GraphController`（+`filterSoon` 300ms 防抖、onDataChanged 更新零匹配提示、init 传 filterQuery）、`settings`（+`filterQuery` 字段 + 默认 `''` + merge 兼容）、`styles.css`（+`.gx-filter*`）、`i18n×6`（+`panel.sec.filter` / `filter.placeholder|syntax|clear|none`）、`README×2`（Highlights + 过滤语法表 + 「不搜正文」边界）、`tests/settingsMerge.test.ts`（+3 迁移测试）
- 删除：`demo/filter-demo.html`（A/B 决策工具，方向 B 拍板后删，避免与真面板漂移）

## 2026-07-15 · 第 1 轮社区巡检：合入外部修复 #10（待眼验），4 条回复待发

### 做了什么
上架后第一次系统性巡检社区反馈，建立每周例行。产出三样：

1. **速览表**（新文件 `docs/社区巡检.md`，**常新文档、每周覆盖更新**）：当前 4 条 open issue + 2 个 open PR 的分诊，含商店数据基线（总下载 1662，0.4.0 发布 4 天 328）。
2. **合入 PR #10**（外部贡献者 @tzhengus 修 issue #9「图体偏心、撑出星空壳」），rebase 到 0.4.0，分支 `fix/graph-fit`，**未合 main、未发布**——等 Rick 眼验。
3. **6 条回复草稿**（scratchpad `reply-drafts-2026-07-15.md`），**一条都没发**——等 Rick 逐条过目。

**本轮最大发现不是技术问题：4 条 issue + 2 个 PR 全部 0 回复，最早的 #6 已挂 7 天**，而其中 4 条出自同一个人（@tzhengus，2 issue + 2 PR，且 PR 质量高、自带测试）。内容侧路线清楚，真正的风险是把唯一的深度外部贡献者晾走。

### 关键决策与被否决的备选
- **PR #10 由我 rebase 而非请作者重做**（Rick 拍板）：作者 base 停在 0.2.2，0.4.0 重写了 `AggregateRenderer` 321 行。压成一个提交、`--author` 保留原作者署名，而非逐个解 3 个中间提交的冲突（那是「先修一版再改两版」的迭代过程，只有最终态有价值）。
- **PR #8（Tag Lens）不 rebase，请作者按新边界重做**（Rick 拍板）：与 0.4.0 撞车两处——(a) 0.4.0 搭车发的 `showTags` 已覆盖标签数据层；(b) 命名撞车，PR 的 "nebula" 指标签 hub 星云，0.4.0 的 `nebula.ts` 指深空背景星云。这是**重新切分**而非解冲突，23 文件改动不该硬 rebase。被否决：直接关闭 PR 自己做（对唯一活跃贡献者打击太大）。
- **改写了原 PR 的分位算法**（工程内部自决）：原实现每帧 `new` 一个 `[半径,权重]` 元组数组 + 全量排序，而 `fitGraphPositions` 在布局热时**每帧**调用（`GraphController` rAF → `updatePositions`）。9.8k 节点实测 **1.53ms/帧＝9.2% 的 60fps 预算**，外加每帧上万次分配的 GC 压力——撞性能纪律红线。改为定桶（2048）加权分位直方图：O(N)、零分配、**0.48ms/帧＝2.9%**（3.2×）。**保真证据**：200 个随机图（500–9500 节点）与原实现对拍，scale 与节点坐标偏差均为 **0.0000%**；原作者自带的 4 个测试一行未改、全绿。
- **rebase 时新增两处接线**（原作者看不到的）：0.4.0 的幽灵边 `updateGhostPositions` 和集群云雾 `clouds.rebuild` 也消费图坐标，必须一并改走显示坐标，否则会与节点脱开。

### 当前状态
- 分支 `fix/graph-fit`（提交 94cd84f，作者署名 Tian Zheng）：**测试 42 通过 / lint 0 error / build 通过**，已 `npm run dev` 部署到 `dev-vault`（3230 篇笔记，Hot Reload 已装）。
- main 未动，0.4.1 未发，社区回复未发。

### 未尽事项与已知问题
- **⚠️ 修复未眼验**：issue #9 是视觉 bug，测试绿 ≠ 图真的居中了。本会话 computer-use 请求 Obsidian 授权**被拒**，无法自验。**Rick 手动确认方法**：开 dev vault → Galaxy View → 切「深空」(Deep Field) 预设 → 等布局沉降 → 看图是否居中、密集区是否收在星空壳内、稀疏孤点允许留在壳外。同时确认曲线连线/幽灵边/集群云雾没跟着跑偏。
- **`GRAPH_FIT_RADIUS_FACTOR = 6.2` 是外部贡献者定的数**（球壳 6.5×，留 ~5% 内边距），未经 Rick 审美确认，可能需要调。
- 0.4.0 遗留的「性能基准未复跑」(S1/S4) 仍未做；本轮只补了 `fitGraphPositions` 的单点微基准。
- issue #6（bloom 残影）**未复现**，回复草稿是问信息而非给修复；`powerPreference: "high-performance"` 是一行改动但会是盲改。

### 文件级变更清单
- 新增：`docs/社区巡检.md`（常新速览表）、`src/render/graphTransform.ts`（来自 PR #10，分位算法由我改写）、`tests/graphTransform.test.ts`（来自 PR #10，未改）
- 改动：`src/render/AggregateRenderer.ts`（+`renderPositions`/`fitWeights` 字段、+`fitPositions()` 收口；10 处坐标消费点改走显示坐标：节点几何/链接填充/选中高亮/幽灵边/集群云雾/创世动画/投影/拾取/相机距离；`this.positions` 仅剩赋值与 fit 入参）

## 2026-07-11 · 发布 0.4.0：曲线连线 + 体积星云 + 预设气质 + 预设改名（搭车 tag 节点 / ghost 幽灵边）

### 做了什么
把 v0.4 一整批视觉升级 + 交互打磨定稿并发布 **0.4.0**（版本从 0.2.2 直接跳到 0.4.0，对齐一路的「v0.4」代号；minAppVersion 不变 1.8.7）。Rick 逐项真机验收后拍板发布。本次发布**一次性带出三批交织在同一批文件里的改动**（git 层面无法干净拆分，Rick 确认一起发）：

- **我这轮 v0.4（主线）**：
  - **曲线连线**：二次贝塞尔、径向外拱（远离星系核），新滑杆「连线弯曲」0=直线。单 LineSegments、每边 K 段折线，主链接/选中高亮/创世动画三处共用 `linkCurves.ts`；段数按档 8/6/4，曲率 0 时退化单段=零回归。
  - **深空背景四层**（星点天幕/星云/浮星/集群云雾），面板新增「深空背景」分区。**星云经历一次大重写**：初版 FBM 烘焙贴 BackSide 球壳 → Rick 反馈「像球面裹在半空、实体感强」→ 改为**体积 billboard 云片**（`NebulaDome` 现为 Points，6 云核成团、各不同深度、加色叠加、sizeAttenuation 视差、软高斯 shader，永远面向相机不露球）。半径从 ×6.9 收到 ×2.6 包裹住图。又按 Rick「太浓」反馈把 shader 强度/透明度系数压到 0.30/0.22。
  - **预设气质拉开**：Rick 反馈「银河/旋臂太像」→ 旋臂改为极扁盘(flatten 0.75)+拉满旋臂力(spiral 0.095)+强聚核(coreGravity 0.22)+强弯连线(linkCurve 0.72)+更俯视(62°)，与银河明确区分。八预设各按气质给 linkCurve+space。
  - **自定义预设改名 + 防丢**：⋯ 菜单（改名/上移/下移/删除，收进原生 Menu，替代原来挤在右上角的四个小按钮 + ✓✕ 二次确认）；改名走内联输入框；**存/删/移/改名全部改为立即写盘**（`saveNow`，绕开 800ms 防抖——原来存完立刻退出会丢）。
  - **文案精简**：删掉自定义预设卡每张都印的「你保存的参数」（零信息量）；内含 Rick 的长期原则「所有界面无效文案一律删」（已存记忆 ui-copy-restraint）。
- **搭车发布（另一/另几个会话做的，本次一并发）**：
  - **tag 作为节点**（`showTags`，默认关）：共享 tag 的笔记通过标签星成簇。
  - **ghost 幽灵边**（`showGhostEdges`，**默认由 true 改为 false**）：读 Constellation 伴侣插件的 `ghost-edges.json` 显示虚线建议连线。

### 关键决策与被否决的备选
- **星云 CPU 逐帧曲线 gather 而非 GPU 坐标纹理**；**体积 billboard 而非球壳/RTT 体积雾**（球壳被 Rick 否了；raymarch 太贵违反性能纪律）。详见 nebula.ts / linkCurves.ts 头注释。
- **ghost 幽灵边默认 true→false**（Rick 拍板）：ghost 依赖尚未正式发布的 Constellation 插件，默认开会让普通用户设置里出现悬空开关。改默认关 = 代码随 0.4.0 发布但不打扰用户，装了 Constellation 的可手动开，等 Constellation 发布再默认开。老用户存档无此字段 → 走新默认 false；已存 true 的（开发环境）保留。
- **三批交织一起发而非拆分**：v0.4/tag/ghost 改动在 settings/AggregateRenderer/GraphController 等同文件里逐行交织，干净拆分风险高于价值；Rick 确认一起发。
- **版本 0.4.0（跳过 0.3.0）**：对齐整个开发周期的 v0.4 代号，减少认知负担；semver minor 跳号合法。

### 当前状态
已发布 0.4.0（发布流程同 0.2.x：main 上 bump→commit→push→tag→release.yml CI 出三件套）。dev vault 即点即用：`npm run dev` → Obsidian 开 `dev-vault/`。

### 未尽事项与已知问题
- **ghost 幽灵边是「半个功能」**：依赖 Constellation 插件（见 [[constellation-plugin]]），Constellation 未发布前这个开关无数据源。tag/ghost **都默认关、都未进 README**（等成为默认体验再宣传）。
- **审美数值仍是眼调起点**：八预设的 linkCurve/space、体积星云的云核数/强度系数、旋臂 spiral 0.095（接近上限）——Rick 已过一轮，后续可能再微调。
- **性能基准未复跑**：新增体积云/曲线 gather/浮星/ghost 层的 S1(环绕 fps)/S4(泄漏) 未在真机重测；对象已全进 dispose 合同但无实测数字。
- tag/ghost 功能的正确性由其原会话/Rick 背书，本会话只保证三批合并后 tsc/lint/test/build 全绿、不互相破坏。

### 文件级变更清单
- 新增：`src/render/linkCurves.ts`、`src/render/nebula.ts`、`src/settings/ghostEdgeImport.ts`（ghost，另一会话）、`tests/{linkCurves,settingsMerge}.test.ts`
- 版本：`manifest.json`/`package.json` 0.2.2→0.4.0、`versions.json` +`"0.4.0":"1.8.7"`
- 我的改动：`AggregateRenderer`(链接可重建几何+背景层管理+体积星云)、`starfield`(+浮星)、`stylePresets`(八预设+linkCurve/space+旋臂气质)、`presets`(tokens+space)、`settings`(linkCurve/space/merge 兼容)、`quality/tiers`(+linkSegments/clusterCloudsAllowed)、`GraphController`(设置传导/预设/改名+立即保存)、`overlay/ControlPanel`(深空背景分区/连线弯曲滑杆/⋯菜单/内联改名)、`i18n×6`(+space/rename/more 键)、`styles.css`、`README×2`(v0.4 视觉+六语)
- 搭车改动（另一会话）：`types`/`data/{buildGraph,GraphStore}`(tag 节点)、`settings`(showTags/showGhostEdges)、`SettingsTab`、`render/shaders`(ghost 虚线)、`OverlayManager`、`render/palette`、`tests/{adjacency,buildGraph}`(tag fixture)

---

## 2026-07-09 · v0.4 工作流：曲线连线 + 深空背景四层形态（NASA Eyes 参考图复刻）

### 做了什么
Rick 给了一张 NASA Eyes 风格参考图，拍板两大特性 + 一个发散扩充，本次全部落地（构建/测试/lint 全绿，待真机眼验）：

- **曲线连线**：连线可弯成远离星系核的二次贝塞尔弧（新滑杆「连线弯曲」，0=直线）。每边 K 段折线仍走同一个 LineSegments（1 draw call）；主链接层 / 选中高亮层 / 创世动画三处共用同一填充函数（`linkCurves.ts`），弧线严格重合。段数按质量档：high 8 / low 6 / mobile 4；曲率 0 时几何退化为单段＝与旧直线渲染完全等价（零回归）。
- **深空背景拆成四层可叠加形态**（Rick 的扩充：默认给一种组合，其余用户自定义）：
  - 星点天幕（原有球壳星点，开关不变）；
  - **星云天幕**：FBM 值噪声一次性烘焙成 equirect 纹理贴 BackSide 球（实测 512×256 烘焙 6.5ms），强度滑杆只调透明度（零重烘焙），换配色主题才重烘焙（染色取主题前两组色压暗去饱和）；两极渐隐规避贴球挤压；亮度钳在 bloom 阈值下防光污染；
  - **空间浮星**：≤1200 点散布图体积内外，sizeAttenuation 近大远小 + 反向慢转 = 视差层（参考图里「零星小星星」的对应物）；
  - **集群云雾**：度数 top 节点做种子、贪心间距取 ≤10 簇，每簇 3 个软高斯加色 sprite（1 draw call，shader 带点大小钳制防填充率打爆），颜色 = 簇内节点均色提饱和——参考图里「云雾缭绕」的主体。只在布局沉降时刻重算，巡航期零成本。
- **预设气质整合**（Rick 原则：贴合各预设气质、拉开区分度；默认仍为银河，看后再调）：银河克制（曲0.35/云0.35）、旋臂流动（曲0.55）、轨道大弧净空（曲0.75/几乎无云）、深空场直线+浮星海（曲0/浮星0.65）、星云满云雾（天幕0.8/云雾0.7）、极简全关、烟火纯黑底（曲0.2）、超新星暖尘余晖（曲0.3/云0.45）。
- 面板新增「深空背景」分区（3 滑杆 + 星点开关移入，带「由 X 设定/已自定义/还原」标记）；i18n 六语补 5 键；README 双语更新（顺手把过时的「双语界面」改为六语）。

### 关键决策与被否决的备选
- **曲线用 CPU 逐帧 gather 而非 GPU 坐标纹理**：GPU 方案（节点坐标传 DataTexture、顶点着色器算贝塞尔）每帧成本 O(n) 更优，但布局热窗口只有 ~5s，CPU 方案实测预估 19,337 边 ×8 段 ≈ 每帧 93 万次 float 写（~2-4ms），沉降后归零；按「第二个真实用例出现前不引抽象」砍掉 GPU 路线，记录在 `linkCurves.ts` 头注释。
- **星云天幕烘焙在 CPU（DataTexture）而非 GPU RTT**：云是低频信号，512×256 CPU 烘焙 6.5ms 足够；避免动 EffectComposer / 渲染目标生命周期。强度=透明度这一招让滑杆零重烘焙。
- **老自定义预设缺新字段按 0 补齐**（而非新默认值）：保持用户存档当时的直线/无背景观感；内置预设才吃新值。
- **悬停预览不重烘焙星云**（染色沿用已烘焙纹理，点击提交才换色）：避免每次 hover 6ms+ 的额外抖动。

### 当前状态
`npm run build`（tsc+esbuild）、`npm run lint`（0 error）、`npm test`（34/34，含新增 linkCurves 7 例 + settingsMerge 4 例）全绿。dev vault 即点即用：`npm run dev` → Obsidian 打开 `dev-vault/`。

### 未尽事项与已知问题
- **待 Rick 真机眼验**：①八预设新气质值全部是起点值，逐个悬停预览看区分度；②曲线弓高 CURVE_BOW=0.32 与弯曲方向（径向外拱）是否顺眼；③星云亮度是否压住了 bloom（尤其「星云」预设 0.8 强度 + tiktok 主题）；④集群云雾在真库 3,230n 上的簇分布是否合理。
- **性能基准未复跑**：S1（沉降后 20s 环绕）与 S4（泄漏金丝雀）需在真机 Obsidian 里跑（面板「高级」区 S1/S2/S3 按钮，dev 构建）；新增对象已全部进 dispose 合同，但 S4 实测数字还没有。布局热窗口的曲线 gather 开销（预估 2-4ms/帧）也待 S2 复跑确认。
- 星云天幕纹理为确定性噪声（固定 seed）：所有用户的云形一样，只有染色不同——可未来加 seed 洗牌按钮。
- Obsidian 设置页（SettingsTab）未加新滑杆（浮动面板已覆盖全部调节），维持「耐久偏好在设置页、实时微调在面板」的既有分工。
- 会话期间并行改动（tags-as-nodes：`types.ts`/`buildGraph.ts`/`GraphStore.ts` 的 `showTags`）不属于本工作流；顺手补了两处它落下的编译尾巴（adjacency 测试 fixture 加 `tag:false`、GraphController 传第三参 `showTags`），未动其设计。

### 文件级变更清单
- 新增：`src/render/linkCurves.ts`（贝塞尔填充纯函数）、`src/render/nebula.ts`（NebulaDome + ClusterClouds）、`tests/linkCurves.test.ts`、`tests/settingsMerge.test.ts`
- 修改：`src/render/AggregateRenderer.ts`（链接层可重建几何、背景层管理 setSpace/syncSpace/setNebulaTint/refreshClusterClouds、dispose 合同扩充）、`src/render/starfield.ts`（+buildFieldStars）、`src/render/stylePresets.ts`（八预设 +linkCurve/space）、`src/render/presets.ts`（tokens +space 总闸）、`src/settings.ts`（LookSettings.linkCurve、SpaceSettings、merge 兼容）、`src/quality/tiers.ts`（+linkSegments/nebulaTexSize/clusterCloudsAllowed）、`src/view/GraphController.ts`（设置传导/预设应用/预览/分区还原/沉降钩子/星云染色同步）、`src/overlay/ControlPanel.ts`（深空背景分区、连线弯曲滑杆、分区标记扩展）、`src/i18n/{en,zh,de,it,es,pt}.ts`（+5 键）、`README.md`/`README.zh.md`、`tests/adjacency.test.ts`（并行改动的 fixture 补齐）

---

## 2026-07-07 · 发布 0.2.2：弹窗黑屏修复 + 六语界面 + 新语言切换器

### 做了什么
从社区 issue/PR 出发（仓库有 2 issue + 3 PR），Rick 拍板做四件、并「继续完成 0.2.2 并发布」。已发 **0.2.2**（CI 成功、Release 三件套齐全）。

- **bug #4「渲染失败」修复**：把视图「移动到新窗口」再最大化会黑屏。**双重根因**：① 可见性 IntersectionObserver 绑在原窗口，视图移到新窗口后把元素误判为不可见 → `paused=true` 跳过渲染；② 渲染循环用主窗口的 rAF，主窗口被最大化的弹窗切到后台后被浏览器节流/暂停。修：换窗口时（`resize()` 检测 document 变化）用**视图当前窗口**重绑可见性 + 用**视图窗口的 rAF**；主题深浅也读视图自己窗口。
- **i18n 扩到六语**：en/zh + **de/it/es/pt**，各 156 键。用后台 workflow（4 语并行翻译 → 各语母语者 QA）产出，落地时清了德语 `&amp;` 转义瑕疵；Dict 类型强制校验全键齐全（tsc 绿）。德/意由社区 PR #5（@bittner）促成、致谢。
- **语言切换器重构**：6 语言放不下「中/EN」开关列 → 表头改**语言码按钮 + Obsidian 原生 Menu**（自动 + 六语、当前项打勾），设置页下拉同步扩到 7 项，`resolveLang` 按 Obsidian 语言前缀识别六语。
- **社区回复草稿**：为 #1/#2/#3/#5 写好草稿（含给 bittner 的德/意致谢）+ #4 修复回复（待发），存 `community-reply-drafts.md`，**未擅自 post/close**。

### 现状 / 未尽
- **已上线 0.2.2**：https://github.com/Longwind1984/galaxy-view/releases/tag/0.2.2 。
- **⚠️ 未做本机眼验**：发布时用户屏幕锁定，computer-use 进不去 → 语言切换器渲染 + 弹窗黑屏修复**没在 Obsidian 里实测**（静态校验充分：tsc/build/lint/test 全绿 + 翻译抽检）。建议更新后眼过：语言菜单切各语言、「移动到新窗口 + 最大化」是否正常显示（尤其 Windows，bug 是那儿报的）。
- **社区对外动作待 Rick**：关/回 issue #1/#2/#3/#5、回 #4（0.2.2 已修）——草稿现成，Rick 过目后发。

## 2026-07-07 · 修复插件评审失败 → 发布 0.2.1

### 做了什么
0.2.0 被 Obsidian 评审机器人判 **Failed**：SOURCE CODE 3 个 error，均在 `src/settings/SettingsTab.ts:7`——那里用 `/* eslint-disable @typescript-eslint/no-deprecated */` 关掉了「弃用 API」检查，而评审用的**更新版 `eslint-plugin-obsidianmd`（0.4.x）禁止关闭该规则**（require-description / disable-enable-pair / no-restricted-disable 三条元规则同时触发）。本地 0.3.0 的 lint 放行了它，所以我这端一开始没发现。

**复现**：把 devDep `eslint-plugin-obsidianmd` 从 0.3.0 升到 **0.4.1**，`npm run lint` 精确复现了评审机器人的 3 个 error + 2 个 warning。**根治**（而非压制）：
- **SettingsTab**：3 个 error 其实是 3 处**弃用方法调用**（`this.display()`×2、`.setWarning()`×1，不是 display 覆写本身）。→ 抽出私有 `render()`，内部重绘调 `render()` 而非弃用的 `display()`；销毁按钮改 `buttonEl.addClass('mod-warning')`（免版本依赖，`setDestructive()` 要 1.13.0 会炸 1.12.x 用户）。删掉整段 eslint-disable。
- **OverlayManager**：卡片日期 `moment(...).format('ll')` 的 moment 类型松散 → 触发 no-unsafe-* 告警。改用原生 `Intl.toLocaleDateString`（顺带去掉 moment 依赖）。
- **styles.css**：`.gx-textlink` 的 `text-decoration: underline dotted` → 简化为 `underline`（消 CSS 部分支持告警）。

**结果**：0.4.1 lint **0 error**（剩 2 个非阻断 warning：eslint.config 的 `config()` 弃用——在 dev 工具文件、评审机器人不查；`prefer-setting-definitions`——`getSettingDefinitions` 需 1.13.0、我们下限 1.8.7，属既定取舍）。build/test（23）全绿。

### 现状
- **已重新发布 0.2.1**：commit `3d0a01e` → main → tag `0.2.1` → `release.yml` CI **成功**（这次 CI 的 lint 用 0.4.1，等价评审机器人规则、0 error），Release 三件套齐全。评审机器人对 0.2.1 应判 Pass（SOURCE CODE 0 error）。
- **教训**：本地 lint 要和评审机器人对齐——把 `eslint-plugin-obsidianmd` 升到 0.4.1 并锁进 package-lock，以后 CI/本地会先于机器人抓到同类问题。

## 2026-07-06 · 发布 0.2.0 上线（已推 GitHub Release，社区商店用户将收到更新）

### 做了什么
Rick 拍板「直接上线」。走完发布全流程并核验成功：
- **版本 0.1.1 → 0.2.0**：manifest.json / package.json / versions.json（`0.2.0 → minAppVersion 1.8.7`）。
- **发布质量门**：build/lint/test 全绿（23）；核验 prod dist 里 `__GALAXY_DEV__` 与 bench 模块内部（collectFrames/observeLongTasks）已死代码剔除；bench 命令在 `if(!__GALAXY_DEV__)return` 之后注册→商店构建不注册（残留的 `runScenario` 死方法与 0.1.1 一致、非用户可见、无碍）。
- **README 刷新**：预设 4→8、补漫游/连接两篇/双语/二度、修「pending review」为已上架、Usage 面板结构更新。
- **git**：把 feat/v0.2 全量工作提交（be86e0b）→ fast-forward 合入 main → push main（Obsidian 据 main 的 manifest 版本判定更新）→ 打 tag `0.2.0` push → 触发 `release.yml`。
- **CI 成功（35s）**：npm ci + lint + test + build + 产物证明(attestation) + `gh release create`。**Release 已发布**（非 draft/prerelease），三件套 main.js/manifest.json/styles.css 齐全。

### 现状 / 待办
- **已上线**：https://github.com/Longwind1984/galaxy-view/releases/tag/0.2.0 。既有商店用户会在「检查更新」看到 0.2.0（社区商店更新走 GitHub Release 自动传播，无需再提交 obsidian-releases PR）。
- **未尽（小）**：README.zh.md 未同步刷新（仅英文 README 更新了）；feat/v0.2 本地分支已合入 main、留着未删。审美数值（漫游节奏、取景余量 1.5×、环绕恢复 6s 等）仍是可调起点，待 Rick 真机浸泡反馈。

## 2026-07-06 · 导览模块从产品层重构为「漫游 + 连接两篇」（方向 C），computer-use 亲验双通

### 做了什么
Rick 选定方向 C：把旧的「4 个工程味模式 chip 汤」拆成两个按意图命名的动作。构建/lint/单测（23，含改写的 tour 测试）全绿，部署 dev-vault，computer-use 亲测两条都通。

- **漫游 Wander**：一个 `▶ 开始/■ 停止` 按钮 + 速度滑杆，**不再暴露任何模式**。背后一个 director 自动混合——主要是「飞向加权节点（度数×随机，枢纽自然常被光顾）→环绕→弹卡」，每第 4 拍插一段样条飞掠添变化。亲验：飞到「思想家网络」（103 出链）弹卡 → 7s 后「法兰克福学派」→ 连续巡游、零崩溃。
- **连接两篇 Connect two**：独立 `选两篇…` 按钮 → 选起点 → 选终点 → `shortestPath` BFS → 逐节点飞。亲验：选「思想家网络→法兰克福学派」飞行成行（慢速 0.05 抓到中途弹卡 + 按钮变「停止」）。
- 面板：外观区 8 预设不变；导航与动效区现为 自动环绕 / 漫游 / 连接两篇 三块 + 重播开场。

### 关键排障：连接两篇「点了不飞」是 computer-use 假象，非 bug
连接两篇一度看似不飞（点完终点＝全局视角、无卡、按钮「开始」）。逐层证否后定位真因：**短的有限巡游（2 节点 ≈10–15s）在 computer-use 每次「点击→截图」的往返间隙里就跑完了**——computer-use 每步会把 Obsidian 切到后台，而停留是**实时计时**的，所以巡游在后台照常推进、等我截图时已 finish+回中心。漫游是无限循环、任何时刻都停在某节点，所以我每次都能抓到；连接两篇会结束，就总被我错过。用 speed 0.05（每节点停留 100s）把总时长拉到 200s+ 后，一截就抓到中途弹卡 + 按钮「停止」→ **确证功能正常**。控制台隔离验证：shortestPath 返回正确路径（连通枢纽对路径长 2）、tickGuided 停留逻辑正确（手控 tick 停留期不推进）、selectNode 飞行正常。

### 文件级变更
- `src/tour/TourDirector.ts`：重写为 `startWander`/`startGuided` 双 API + `tickWander`（回顾拍 + 每 4 拍飞掠）/`tickGuided`（队列走）；去掉 rediscover/flyby/grandtour 用户模式。
- `src/view/GraphController.ts`：`toggleTour`→startWander；`startGuidedTour`→`startConnectTwo`；删 `setTourMode`；回调 `onConnectTwo`；去 `TourMode` import。
- `src/overlay/ControlPanel.ts`：导览块重建为 漫游 block + 连接两篇 block；删模式 chips/`TOUR_MODES`/`onTourMode`。
- `src/settings.ts`：`TourSettings` 精简为 `{speed}`；删 `TourMode`、DEFAULT/merge 的 mode/hopCount。
- `src/i18n/{en,zh}.ts`：删 `tour.mode.*`、`nav.tour*`；加 `nav.wander/wanderSub/connect/connectGo/connectSub`。
- `tests/tour.test.ts`：改写为 wander/guided 用例（6 个）。

## 2026-07-06 · 取景改 FOV 自适应+绕质心（全局视角/居中）＋自动环绕仅拖动才打断（computer-use 亲验）

### 做了什么（1、2 已 computer-use 亲测通过；3 待 Rick 定方向）
- **① 初始/回中心视角太近 → 改「按实际节点云 FOV 取景 + 绕质心」**：旧版盯世界原点、距离＝`种子半径×固定倍率`，力学一铺展就太近、且质心漂移导致画面偏一边、环绕时来回甩。新版 `computeFraming()` 算**真实质心 + 到质心距离的 95 分位半径**（避开离群孤儿），取景距离＝`fitRadius / sin(FOV/2) × 1.5` 余量，相机绕质心。→ 真·全局视角、居中、环绕不再偏。亲测：回中心后星系居中、约占画面 65%、留白舒适；转 4s 仍居中。
- **② 自动环绕太容易打断 → 只有真拖动/缩放才打断**：旧版 pointerdown 即 `markInput` 停环绕（连点选都停）+ 10s 才恢复。新版按下不停，指针移动过 4px 阈值才算拖动→才停；滚轮/触摸拖动照停；`resumeDelayMs` 10s→6s。亲测：在空白处单击一下，之后 4s 相机仍在环绕（核心从左下转到中右），点击不再打断。OrbitControls 每帧读当前机位，停环绕交接无跳变。

### 文件级变更
- `src/interactions/CameraDirector.ts`：新增 `FRAMING_MARGIN=1.5`、`DRAG_THRESHOLD_PX=4`；`framingPosition/setInitialFraming/resetView` 改为收 `(center, fitRadius)` 并按 FOV 算距离；`bindPointer` 改为 pointermove 过阈值才 `markInput`（滚轮/touchmove 照旧打断）。
- `src/view/GraphController.ts`：新增 `computeFraming()`（质心+95 分位半径），三处取景调用（初始/开场/回中心）改用它。
- `src/constants.ts`：`CRUISE.resumeDelayMs` 10_000→6_000。

### 未尽
- **③ 完全重构导览模块（从产品设计起）**：已做产品批判 + 三个方向待 Rick 拍板，再做可预览版本。当前导览＝4 个工程味模式 chip 混装「氛围观赏」与「寻路」两种意图，认知负担高、无叙事收口。

## 2026-07-05（续）· 面板三项微调 + 定位并修复「导览冻结整个视图」的真 bug（computer-use 亲测）

### 做了什么
Rick 反馈三点，全部落地；并用 computer-use 亲自在 Obsidian 里复现 + 定位 + 修复 + 验证了「导览点了没反应」的真因。构建/lint/单测（22）全绿，两轮部署 dev-vault（末次含 flyby 修复）。

- **删掉「悬停预设即预览 · 点击才应用」文案**：交互已自解释时这类说明是噪声。同步把该原则写进**全局 `~/.claude/CLAUDE.md`**（自主权与把关章）：交互方式明显 / 符合直觉 / 低成本可试出时，不加说明性文案。
- **「导航与动效」区改为可折叠**：原是常驻静态区，现包成 `<details>`（默认展开、开合持久化，section id=`nav`）；summary 复用「区」标题观感（大写+字距）仅多一个 ▸ caret。
- **「力学」分区下移到「辉光」之后**：顺序改为 外观与配色 → 辉光 → 力学。

### 真因：flyby 的 CatmullRom 采样抛错 → 冻结整个渲染循环（＝「点了没反应」）
先做了静态审计（链路完整、已部署），一度以为无法复现。**后按 Rick 要求用 computer-use 打开 Obsidian dev-vault 亲测**：把 Galaxy view 窗口从副屏（Electron/WebGL 在副屏被截屏成全黑）挪到内建屏，点 ▶ 巡游——按钮变「停止」但**画面冻结、拖拽无响应**。开 DevTools 控制台拿到确证：

```
Uncaught TypeError: Cannot read properties of undefined (reading 'x')
  at Vector3.distanceToSquared → CatmullRomCurve3.getPoint → getPointAt
  at CameraDirector.update → loop
```

flyby 用 `CatmullRomCurve3` 造样条，某控制点是 NaN/undefined（默认 centripetal 类型按点距开方，遇异常点直接读 undefined.x）→ 在 **`CameraDirector.update` 里抛错**。而我上一版的 try/catch 只包了 `tour.tick`、**没包 `director.update`**——异常冒泡出 rAF `loop`、`requestAnimationFrame` 不再排下一帧，**整个渲染循环死掉、全视图冻结**（DOM 面板仍活，所以按钮还能切）。这正是「首次跑 flyby 就整个插件卡死」＝「完全没反应」。

**三层修复**：① `flyPath` 清洗控制点（剔非有限点 + 去相邻重合点）并改用 uniform `'catmullrom'`；② `update` 里给曲线采样加 try/catch + 非有限兜底，异常就地放弃该段路径；③ rAF `loop` 把 `tour.tick` 与 `director.update` 一起包进 try/catch，任何相机异常都 abort 巡游 + `cancelMotion()` + 弹 Notice，**绝不再冻结循环**。

**亲测验证（修复后）**：点 ▶ 巡游 → 按钮变「停止」、**控制台零报错**、相机沿样条连续飞掠（间隔 2s 两帧画面明显不同）、再点「停止」干净回落。#2/#3 也同屏确认（力学在辉光下、导航区带 ▾ 可折叠、预览提示已消失）。

### 文件级变更
- `src/interactions/CameraDirector.ts`：`flyPath` 清洗控制点 + uniform 曲线；`update` 路径分支 try/catch + 非有限兜底；新增 `cancelMotion()`。
- `src/view/GraphController.ts`：rAF loop 的 try/catch 扩到 `director.update`，catch 里 `abort()` + `cancelMotion()` + Notice；toggleTour try/catch；guided 入口即时 Notice；起不了给 tourEmpty。
- `src/overlay/ControlPanel.ts`：删预览提示行；辉光/力学换序；导航区包成可折叠 `gx-zone-section`（navBody 承载环绕/导览/重播）。
- `src/i18n/{en,zh}.ts`：删 `preset.previewTip`；加 `notice.tourEmpty/guidedPick/tourError`。
- `styles.css`：加 `.gx-zone-section` summary 样式；删 `.gx-preview-tip`。
- `~/.claude/CLAUDE.md`：新增「文案克制」原则。

---

## 2026-07-05 · 设置面板 v4 重构：先在本地 HTML demo 打磨，定稿后整体回填插件并部署（待 Rick 眼验）

### 做了什么
按 Rick 的《面板优化实施说明》+ 多轮迭代，先在**本地可交互 HTML demo**（`demo/panel-demo.html`，起了个静态服务器 localhost:4319 边改边验）把整套交互敲定，Rick 确认后**整体回填真插件**，构建/静态检查/单测全绿并部署到 dev-vault。**这一大改我这端无法在 Obsidian 里眼验，需 Rick 在 dev-vault 手验。**

- **信息架构按意图重排**：外观区（预设→细调分区）/ 导航与动效区（自动环绕·导览·重播开场）/ 底栏（全部重置·存为预设·高级）。fps 从顶栏下放到「高级」，顶栏只留笔记数。
- **预设↔参数关系显性化**：悬停预设**即时预览**视觉效果（辉光/大小/星空/配色实时应用到 3D，物理只在点击提交——悬停不重热布局，避免卡顿）；点击才提交。细调分区带**「由 X 设定 / 已自定义」标记 + 分区级「↺ 还原」**（靠对比当前设置与激活预设算脏）。
- **预设重做**：合并为一条扁平列表（去掉星系/特效分类），8 个预设在**有无星空背景 / 配色主题 / 节点大小 / 力学 / 辉光**五维同时拉大差异；每个预设**手绘小 icon**（`presetIcons.ts`，createSvg 画，按主题色染）+ 功能副标题。
- **自定义预设**：存为我的预设 → 可**排序（↑↓）+ 删除（原地确认 ✓/✕）**，持久化在 settings.customPresets。
- **关联深度移出面板 → 节点卡片**：选中默认点亮一度；卡片底部一行不起眼的「关联 · 一度/二度」切换。
- **巡航→自动环绕、巡游/探索→导览**，两者对等成块；创世动画确认为**纯重播**（切预设不触发它），改名「重播开场动画」下放到导航区。
- **画质自动策略改双向 + 迟滞**：auto 从最高档起步；在 high 连续 3×5s<30fps→降 low，在 low 连续 4×5s>55fps（有余量）→升回 high（不同阈值/次数=迟滞防抖）。取代旧的「单向降档、整会话不回升」。
- **核心手势收进常驻「?」帮助浮层**（不可永久 dismiss），删掉旧的可关闭提示横幅。

### 关键决策与被否决备选
- **两处「先查代码」结论**：① 创世动画=纯 `playReveal` 重播，且 `applyStylePreset` 不调它 → 按「重播」处理、下放。② 预设是 `markActiveChip` 单选 → 统一单选高亮。
- **悬停预览只覆盖视觉参数（不含物理）**：物理预览要重热力布局，每次 hover 都重热会卡且乱；故物理只在点击提交。面板暂不做滑杆级 hover 预览（3D 已给到最直接反馈）。
- **保留星系隐喻与诗意命名**（产品资产），靠 icon+副标题+悬停预览降低学习成本，而非改名简化。
- **先 demo 后回填**：面板是纯用户可见层，按协议用「可看的版本让 Rick 选」，定稿再动插件，降返工。

### 当前状态：能跑什么、怎么验
- 分支 `feat/v0.2`（**未提交**）。构建/lint/单测全绿（22/22）。dev 构建已部署 dev-vault（main.js 07-05 00:03，端口标记齐全）。
- demo 仍在 localhost:4319（`preview_start` 起的静态服务器），Rick 可继续用来对照。
- **待 Rick 在 dev-vault 手验**（reload 插件）：① 预设卡 icon/副标题、**悬停看 3D 实时预览**、点击提交；② 分区「由 X 设定/已自定义/还原」；③ 存预设→排序/删除（确认）；④ 选中节点→卡片上一度/二度；⑤ 自动环绕/导览分区；⑥ 画质 auto 双向调度（跑 S1-S3 压一压看会不会升降档）。
  - **注意**：dev-vault 旧 data.json 存的是之前测试的物理参数、activePreset 无值→默认 galaxy，所以初始「力学/配色」分区可能显示「已自定义」；**点任一预设或「全部重置」即同步**成整套。

### 未尽事项 / 已知
- 全部为起点值（力/预设/画质阈值/巡游节奏），待眼调。
- 我无法眼验插件渲染；若有交互/视觉 bug，靠 Rick 反馈修。
- 旧的 `hintsSeen` 设置、`panel.firstRunHint`、`cycleSelectionDepth` 变为无用（无害，未清）。

### 文件级变更清单
- 新增：`demo/panel-demo.html`（交互原型）、`demo/index.html`（重定向）、`src/overlay/presetIcons.ts`（createSvg 手绘 8 预设 icon）、`.claude/launch.json`（demo 静态服务器配置，在 Obsidian_PKM 根）
- `src/render/stylePresets.ts`（8 预设重做 + starfield/theme/frameElevDeg，扁平）
- `src/settings.ts`（+activePreset/customPresets + 校验）
- `src/view/GraphController.ts`（applyStylePreset 套 starfield+theme+activePreset；previewStylePreset/endStylePreview；saveCurrentAsPreset/moveCustomPreset/deleteCustomPreset/restorePresetSection；看门狗双向 autoLow；HUD 拆分 fps→advStatsEl；卡片深度回调；buildPanel 回调换新）
- `src/overlay/ControlPanel.ts`（**整体重写**为 v4：分区 IA + 预设卡 + 悬停预览 + 分区标记/还原 + 自定义预设排序/删除确认 + ?帮助浮层 + 画质分段 + fps→advanced）
- `src/overlay/OverlayManager.ts`（卡片加一度/二度深度控件 + 回调）
- `src/i18n/{en,zh}.ts`（面板重构一批新键：zone/preset.sub/sec/mine/nav/quality.autoSub/card 等）
- `styles.css`（面板 v4 全套样式 + 卡片深度控件；caret 改用 span）

## 2026-07-04 · v0.2 公开就绪（英文/i18n + 银河重做 + 预设包 + 二度选中）+ v0.3 巡游系统（代码完成，待 dev-vault 眼验）

### 做了什么
面向公开 Obsidian 用户做「下一个版本」。按 Rick 拍板分两期，本次一口气把两期代码都写完并跑绿了构建/静态检查/单测；**视觉与相机行为还没在 Obsidian 里眼验**（我这端起不了 GUI），下一步需要 Rick 在 dev-vault 里看。

- **英文界面 / i18n（v0.2 A）**：新建 `src/i18n/`（en 为准 + zh 镜像 + `t()` + 语言检测链），把面板/卡片/搜索/命令/通知里约 58 处硬编码中文全部抽成键；**英文成为公开默认**，`getLanguage()` 检测跟随 Obsidian，可在设置页手选 Auto/English/中文。新增插件**设置页**（语言、画质、视觉模式、显示孤儿/未解析、全部重置），与画布浮动面板读写同一份设置。卡片日期改 `moment().format('ll')` 本地化。
- **面板信息架构（v0.2 B）**：首屏只留搜索/回中心/巡航/风格 chips；分区按新手频次重排（外观→力学→辉光→巡航→探索→高级）；**分区开合状态持久化**；首次打开显示一行可关闭提示替代 7 行帮助墙；移动端首屏收起面板。
- **银河布局重做（v0.2 C）**：定位「银河太宽」根因＝**缺一个力**（旧实现只把均匀球压扁成均匀薄饼）。新增两个 Worker 端自定义力：`coreGravity`（径向核心引力＝致密亮核＋径向密度梯度，按度数加权让 hub 沉核）+ `spiral`（切向旋臂）。两力都 alpha 缩放、沉降后趋零、不炸暖图；**同一实现同时供 Worker 与主线程回退**（`galaxyForces.ts` 单一来源）。相机新增取景仰角，盘类预设俯视看臂。
- **预设包（v0.2 D）**：重做「银河」默认，新增 4 个 NASA 灵感预设——旋臂星系 / 轨道(Eyes) / 深空场(JWST) / 超新星；chips 分「星系/特效」两组。
- **二度关联选中（v0.2 E）**：新建 CSR 邻接表（`Adjacency.ts`，随数据重建），选中改为邻域 BFS（取代每次点击 O(全边) 扫描）；可选展示二度关联＝**分级调暗**（选中/一度全亮、二度外壳、其余淡出，复用单 float aDim，零新增 draw call）；常用行加「关联深度 1/2」按钮；**双击节点＝打开笔记**。补了 6 个 Adjacency 单测。
- **巡游/自动驾驶系统（v0.3）**：CameraDirector 加可复用**样条路径基元** `PathTween`（CatmullRom、弧长匀速、任何输入即停、零每帧分配）；新建 `TourDirector` 状态机（tick 由 rAF 的 paused 守卫驱动 → 隐藏视图自然冻结）。三种模式：随机回顾（度数加权+LRU）、小行星飞掠（样条穿星场）、枢纽大巡游（访问 top-hub 后回总览）。面板加「探索」分区（开始/停止 + 模式 chips + 速度），命令面板加「开始/停止巡游」。移动档整套禁用。

### 关键决策与被否决的备选
- **minAppVersion 1.7.2 → 1.8.7**（被迫）：用 `getLanguage()` 做语言检测，obsidianmd linter 要求最低版本 ≥1.8.7，否则报 no-unsupported-api。1.8.7 到 2026-07 已足够老，遂上调；随之删掉多余的 localStorage 回退。备选「保 1.7.2 + 运行时护栏」被 linter 否决。
- **预设包放进 0.2 而非 0.3**（对 Q1 排期描述的微调，已在计划里标注请 Rick 批准时留意）：新力落地后 4 个预设几乎只是参数对象，近零成本；0.3 遂专注巡游系统这一最大新子系统。
- **recommendedTheme 不自动套用**：预设带荐配色元数据，但 v0.2 不自动改用户配色——保持「形/背景/配色」三轴解耦（计划的头条原则），避免惊吓。
- **飞掠暂不做压路侧倾（banking）**：改 `camera.up` 交回 OrbitControls 易留歪地平线，且我这端无法眼验；先上稳的切线前瞻版本，侧倾留后续。
- **相机仰角只存值、不立刻甩镜头**：切盘类预设后仰角下次「回中心/R」生效，避免打断当前交互（也可后续做「仅 idle 时自动倾斜」）。
- **分级调暗值 1.0/1.0/0.45/0.12**：一度保持与旧版一致（老用户无回归），二度作外壳——起点值，四个常量随时可调。

### 当前状态：现在能跑什么，怎么跑
- 分支 `feat/v0.2`（**未提交**，等 Rick 发话再 commit）。
- 自动验证全绿：`npm run build`（tsc + esbuild production）零错、`npm run lint` 零错、`npm test` 14/14 过（含 6 个新 Adjacency 单测）。prod 产物已确认不含 dev 命令串。
- **待 Rick 手验（我起不了 Obsidian GUI）**：`npm run dev` 直出 dev-vault → 打开 Obsidian dev-vault，重点看：① 银河是否「更像银河」（致密核/旋臂/俯视取景）——切各预设+调 core/spiral 滑杆，眼选定稿数值；② 设置页切 EN/中文面板即时重建；③ 关联深度 1↔2 的分级调暗与双击开笔记；④ 三种巡游模式（任意输入即停、飞掠不晕、大巡游回总览）；⑤ 跑 dev 命令 S1/S2/S3 + S4 金丝雀确认性能门与零泄漏（尤其暖图切预设的重热稳定性、飞掠帧率）。

### 未尽事项与已知问题
- **审美未定稿**：所有力强度/预设参数/相机仰角/巡游停留时长都是起点值，等 Rick 眼选。
- **两处未实现（已知）**：两点引导路径（Guided Path，设计即定为 0.3 stretch）；选中打磨里的 悬停一度环 + Tab 邻居循环（与 dim 系统交互，留 fast-follow）；飞掠侧倾。
- **面板「探索」按钮的运行态**：靠 TourDirector 的 onStateChange 回同步 play/stop，自然结束（大巡游）也会同步；语言切换重建面板后按钮回到「开始」（不影响功能）。
- **老用户升级影响**：新的 coreGravity/spiral 默认值会让老用户的银河也长出致密核（v0.2 本就是银河重做，视为改进）；暖启动坐标缓存在低 alpha 下由 alpha 缩放的新力温和收敛，不会瞬间甩开。
- 未提交、未发版；发版需另走 `npm version` + CI（本次未动）。

### 文件级变更清单
- 新增：`src/i18n/{index,en,zh}.ts`、`src/settings/SettingsTab.ts`、`src/data/Adjacency.ts`、`src/layout/galaxyForces.ts`、`src/tour/TourDirector.ts`、`tests/adjacency.test.ts`
- 设置/类型：`src/settings.ts`（+language/panelSections/hintsSeen/selectionDepth/tour 五组字段 + coreGravity/spiral 入 PhysicsSettings + 默认改重做后银河 + merge 校验 + toLayoutParams 透传）、`src/types.ts`（LayoutParams +coreGravity/spiral）
- 布局：`src/layout/forceWorker.ts` + `src/layout/MainThreadForceLayout.ts`（注册/重建两个新力，共用 galaxyForces）
- 渲染/预设：`src/render/stylePresets.ts`（银河重做 + 4 新预设 + nameEn/group/frameElevDeg/recommendedTheme）、`src/render/AggregateRenderer.ts`（setFocus 改分级权重、setSelectedLinks 改 tier1/tier2 单层）
- 相机：`src/interactions/CameraDirector.ts`（framingElevDeg + setFramingElev + PathTween/flyPath + update 路径分支 + markInput 打断 path）
- 数据：`src/data/GraphStore.ts`（持 adjacency，rebuild 里 buildAdjacency）
- 控制器：`src/view/GraphController.ts`（i18n 通知/HUD、rebuildPanel/syncFromSettings、applyStylePreset 收 StylePreset+取景仰角、selectNode 重写为 BFS 分级、cycleSelectionDepth、双击开笔记、TourDirector 实例化+tick+toggle/setMode/setSpeed、onDataChanged/applyTier 中止巡游、启动取景仰角）
- 面板/覆盖层：`src/overlay/ControlPanel.ts`（全量 i18n + IA 重排 + 分区持久化 + 首屏提示 + genesis 文字链 + chip 分组 + 深度按钮 + 探索分区 + setTourRunning）、`src/overlay/OverlayManager.ts`（卡片 i18n + moment 日期）、`src/overlay/Slider.ts`（notch i18n）、`src/view/SearchModal.ts`（i18n）
- 入口/清单：`src/main.ts`（setLang + addSettingTab + 命令名/通知 i18n + tour 命令）、`manifest.json`（minAppVersion 1.8.7）、`styles.css`（首屏提示/文字链/chip 分组样式）

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
