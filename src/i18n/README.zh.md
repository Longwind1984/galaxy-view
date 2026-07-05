# 本地化（i18n）

> English docs: [README.md](README.md).

插件在加载时根据 Obsidian 的显示语言（`localStorage["language"]`）一次性确定当前
语言：任何 `zh*` 变体 → `zh.ts`，其余一律回退到 `en.ts`。所有调用处都通过
`index.ts` 导出的 `t` 读取文案，例如 `t.panel.search`。

`en.ts` 定义结构：`type Translations = typeof en`，其他每个语言对象都声明为
`: Translations`，因此所有语言文件的结构保持完全一致。

## 新增或修改文案

1. 在 `en.ts` 中新增/修改该键。
2. 在其他每个语言文件（`zh.ts`、`de.ts` 等）中新增/修改**相同**的键。
3. 在调用处通过 `t.<组>.<键>` 读取。

漏掉第 2 步会**故意**导致编译报错（`property is missing in type`），这不是
bug：它确保任何语言都不会漏发或残留过期文案。对于需要插值的文案，把值写成
函数——例如 `count: (n: number): string => \`${n} items\``——并在每个语言中
保持相同的签名。

## 新增语言

将现有语言文件（例如 `zh.ts`）复制为 `<代码>.ts`，翻译其中的值（保留键名），
然后在 `index.ts` 中注册（加入 `DICTS` 映射、`Locale` 类型和 `detectLocale()`）。
