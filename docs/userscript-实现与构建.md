# ShowJCR Rank Userscript — 实现与构建说明

> 2026-10-07 完成 MVP：Google Scholar + PubMed 双站点，本地数据离线匹配（含 NLM 缩写映射）。

## 产物

| 文件 | 说明 |
|---|---|
| `dist/show-rank.user.js` | 最终用户脚本（数据内嵌，2.9 MB），Tampermonkey 直接安装 |
| `dist/rank-data.json` | 独立数据文件（远程数据模式用，或供其他形态复用） |
| `userscript/template.user.js` | 脚本模板（`/*__DATA__*/null/*__DATA__*/` 占位符待注入） |
| `tools/build-data.fsx` | 数据管线：ShowJCR CSV + NLM jourcache.xml → rank-data.json |
| `tools/build-userscript.ps1` | 把 JSON 注入模板 → show-rank.user.js |
| `tools/verify.ps1` | 静态验证：JSON 解析、键规范化、CSV 对拍、括号配平 |

## 构建（全 .NET 工具链，无需 node/python）

```powershell
dotnet fsi tools/build-data.fsx      # 重新生成 dist/rank-data.json
pwsh tools/build-userscript.ps1      # 重新生成 dist/show-rank.user.js
pwsh tools/verify.ps1                # 静态验证
node-v24.21.0-win-x64\node.exe --check dist\show-rank.user.js   # 语法检查（可选）
```

## 数据结构（rank-data.json）

```json
{
  "version": "2025.1",
  "fields": ["fqbQu","fqbTop","jcrIF","jcrQu","xrQu","xrTop","xrWarn"],
  "journals": { "NATURE COMMUNICATIONS": ["1","1","18.1","Q1","1","1",""] },
  "alias":    { "NAT COMMUN": "NATURE COMMUNICATIONS" }
}
```

- `journals` 键 = 归一化刊名（大写、仅 ASCII 字母数字、压空白）；值 7 槽位：中科院大类分区/Top、JCR IF/Quartile、新锐分区/Top/预警。
- `alias` 来自 NLM `Pubmed/jourcache.xml`（42884 刊的 MedAbbr/IsoAbbr/Alias/全名变体），歧义缩写保守丢弃（当前 433 条）。

## 匹配链路

```
页面提取刊名 → normalize（与 F# 管线同一实现）
  → journals[key]            直接命中
  → alias[key] → journals    缩写/全名变体命中
  → 未命中则不标注（保守，不误标）
```

已验证样例：`Nat Commun`、`N Engl J Med`、`J Clin Oncol`、带副标题全名、`Lancet (London, England)`、`Science (New York, N.Y.)` 等 10/10 命中。

## 站点适配（userscript/template.user.js）

当前 7 个站点适配器（v0.3，除 GS/PubMed 外移植自 easyScholar 选择器，**未经真页实测**）：

| 站点 | 列表 | 详情 | 刊名来源 |
|---|---|---|---|
| Google Scholar | ✓ | – | `div.gs_a` 引用行正则；截断走前缀/cite 兜底 |
| PubMed | ✓ | ✓ | 列表 `full-journal-citation[title]`；详情 `journal-actions-trigger` |
| 百度学术 | ✓（新旧两版 DOM） | ✓ | `.paper-info a[data/journal]` / `.message .journal`，去《》 |
| ScienceDirect | ✓ | ✓（仅文章头） | `a[data-aa-name*='srp-srctitle-']` / `publication-title-link` |
| IEEE Xplore | ✓ | ✓ | `description a` / `stats-document-abstract-publishedIn a` |
| Semantic Scholar | ✓ | – | `.cl-paper__bulleted-row__item > a > span`（venue） |
| dblp | ✓ | – | `span[itemprop='isPartOf'] span[itemprop='name']` |

- 幂等：占位 `span.sjcr-flag`（截断条目带 `data-sjcr-cid`）；每 1500ms 轮询重扫兼容动态加载；cite 队列元素失活（翻页）自动跳过；cite 等待期间显示灰色 `…` 占位徽标（`sjcr-wait`），成功替换为真实徽章，失败/未命中自动移除。
- 待验证站点（需样本页）：Springer（easyScholar 选择器已过时）、CNKI、万方、维普、X-MOL、WOS、Scopus、ResearchGate 等。

## 实测记录（2026-10-07）

- PubMed 列表页 / 详情页：正常 ✓
- Google Scholar 截断修复：样本页 10 条中 5 条直接标注（2 精确 + 3 唯一前缀），4 条真歧义走 cite 队列恢复
- cite 提取验证：`Plant, Cell & Environment`、`The Plant Journal`（THE 回退）、`Plant J.`（NLM 缩写）全命中

## 安装（Firefox + Tampermonkey）

1. Firefox 安装 Tampermonkey 扩展；
2. Tampermonkey 面板 → 添加新脚本 → 粘贴 `dist/show-rank.user.js` 全文 → 保存；
3. 打开 `https://scholar.google.com/scholar?q=...` 或 PubMed 搜索页验证徽章。

## 已知限制

- **刊名完全不同**的个别刊（如 `BMJ` ↔ JCR 键 `BMJ BRITISH MEDICAL JOURNAL`）无映射，不标注；后续可加人工映射表。
- GS 截断刊名若前缀歧义且 cite 请求失败/被限流，则该条目不标注（宁缺勿错）。
- JCR 多学科 Quartile 取第一个非空值；5 年 IF、JCI 无数据源（ShowJCR 未提供）。
- 远程数据模式（`DATA_URL`）已实现但默认关闭：每次页面加载拉取 3 MB 有开销，待托管地址确定后启用。
