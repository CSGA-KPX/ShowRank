# easyScholar 扩展页面注入逻辑分析

> 分析对象：`easyScholar-xpi-source/`（Firefox XPI 解包源码，manifest_version 3，version 15.2）
> 分析日期：2026-10-07
> 代码为压缩（minify）后的 JS，函数名已混淆（单字母），本文按职责命名还原。

## 1. 总体架构

```
content script (utils.js, 注入所有网页)
   ├─ j(url)              站点识别 → 返回站点 key（如 "Google"、"Pubmed"）
   ├─ pa[site]()          站点采集函数：用 jQuery 选择器抓期刊名，插入占位标记
   ├─ o(publicationName)  把 {paperID: 期刊名} 发给 background
   │      chrome.runtime.sendMessage({action:"getPapersRank", data})
   ▼
service worker (service_worker.js)
   └─ POST https://www.easyscholar.cc/extension/listPublicationRank9   ← 收费 API
   ▼
content script 回调
   └─ ie[rankType](value, row)  按等级类型渲染彩色标签到占位标记之后
```

**收费点不在扩展本身，而在服务端 API**：`listPublicationRank9` 返回非 200 / code 10007 时提示付费或跳转官网。新扩展的核心思路就是用**本地数据库**替代这一步。

## 2. manifest.json 要点

- `content_scripts` 匹配 `https://*/*`、`http://*/*`，排除一批站点（各 AI 聊天页、Twitter、PDF 路径等），`run_at: document_end`。
- 注入 JS 链：jquery-3.3.1 → dialog.js → xm-select.js → **utils.js（核心，204KB）** → sweetalert2 → translation.js。
- 权限极少：仅 `storage`；host_permissions 仅 easyscholar 自家域名（说明数据交互全部走 chrome.runtime.sendMessage → background fetch）。
- background：`show_ranking/ranking/service_worker.js`，`persistent: false`。

## 3. 核心注入流程（utils.js）

### 3.1 站点识别 `j(url)`

约 150 个站点分支，靠 `location.href` 子串 + 页面特征 jQuery 探测（如
`$(".resultList > #resultListControl #accessibleMainContent").length!==0` 判 EBSCO）。
完整站点 key 见 `pa` 映射（157 个采集函数），包括：

- 中文：百度学术（3 种页面）、CNKI（经典/句子检索/详情/AI 检索/海外等 10+ 变体）、万方、维普、NSTL/Yuntsg、超星、读秀、Sinomed、中华医学（yiigle）、pubscholar、medreading、fybcc（amend）、科研通（blyun）、X-MOL（3 代页面）、LetPub、ablesci 等
- 英文：Google Scholar、Semantic Scholar、PubMed（新旧两版）、ScienceDirect、Springer（3 种）、Wiley、Nature、RSC、ACS、MDPI、IEEE、Scopus（新旧）、Web of Science（检索/详情/JCR）、ResearchGate、ConnectedPapers、Dimensions、JSTOR、EBSCO、ProQuest、Cambridge、Oxford、SAGE、BMC、Frontiers、ACM、Ei、HeinOnline、PhilPapers、DBLP、Aminer、ORCID 等

### 3.2 采集函数 `pa[site]()`（以 Google Scholar 的 `Oa()` 为例）

1. 用站点专属 jQuery 选择器遍历结果条目（如 `$("div > div.gs_ri").each(...)`）。
2. 跳过已处理的条目（检查 `span.easyScholarPaperFlag` 是否存在——这是幂等关键）。
3. 从条目内提取期刊名（如 GS 从 `div.gs_a` 文本正则 `/- .*?(?=, [0-9]{4})/` 抓引用行），转大写、去书名号等。
4. 在标题元素后插入占位标记：`<span class="easyScholarPaperFlag" paperID="{随机数}">`。
5. 汇总为 `a[paperID] = 期刊名`，构造请求体：
   ```js
   { publicationName: {paperID: 期刊名, ...},
     paperTotal: n,
     requirePublicationRank: [...],  // 用户勾选的等级类型，存于 storage.freeRankList
     website: "谷歌学术", url, version }
   ```
6. 个别站点（GS 截断标题）还会先 ajax 抓取完整引用再二次补发。

### 3.3 请求与收费门

- content script → `chrome.runtime.sendMessage({action:"getPapersRank", data})`
- service_worker.js → `POST https://www.easyscholar.cc/extension/listPublicationRank9`
- 回调处理：`code===10007` → toast + 6 秒后 `window.open("https://www.easyscholar.cc")`（**收费拦截**）；`code!==200` → toast 报错；200 → 进入渲染。
- 名称清洗 `Sa()`：去换行/制表/回车、trim、丢弃长度≤1 的条目。

### 3.4 渲染 `ie` 映射（等级类型 → 渲染函数）

响应 `data.publicationRankList` 是数组，每行含 `tempID`（对应 paperID）及各等级字段。`ie` 映射支持的等级 key（即服务端可返回的数据种类）：

| 类别 | keys |
|---|---|
| 分区/IF | `sci`(SCI 分区)、`sciif`(IF)、`sciif5`(5 年 IF)、`jci`、`sciBase`(中科院基础版)、`sciUp`(中科院升级版)、`sciUpTop`、`xr`(新锐)、`xrTop`、`xrWarn`、`esci`、`sciwarn`、`ahci`、`ssci`、`esi` |
| 高校/机构目录 | `ccf`、`cscd`、`cssci`、`pku`、`nju`、`fdu`、`sjtu`、`zju`、`xmu`、`xju`、`xdu`、`cqu`、`cug`、`hhu`、`ruc`、`cufe`、`cju`、`cpu`、`swufe`、`sdufe`、`uibe`、`swjtu`、`scu`、`eii`、`csc`… |
| 国际商学院 | `ft50`、`utd24`、`ajg`、`fms` |
| 其他 | `Title`、`zhintro`/`enintro`（分区简介）、`Custom` |

渲染模式统一（以 `ji` = sci 渲染为例）：

```js
let t = $("<span></span>");
t.addClass("easyscholar-1");        // 按分区档着色 1..5
t.addClass("easyscholar-ranking");
t.text("SCI Q1");
$("span[paperid=" + tempID + "]:first").after(t);   // 插到占位标记之后
```

即：**采集时在标题后插占位 span，渲染时按 paperID 找占位 span 再 `.after()` 插彩色徽章**。

### 3.5 轮询重扫（SPA 兼容）

未使用 MutationObserver，而是定时器轮询：

```js
// 启动后每 300ms 检测站点，识别成功后按站点差异化间隔重复 R(p) + T()
Pubmed: 1500ms / ConnectedPapersDetail: 800ms / ResearchGate: 3500ms / 默认: 2500ms
```

`R(p)` = 重新执行采集（靠 `easyScholarPaperFlag` 幂等去重），`T()` = 文献收藏按钮注入。兼容动态加载的搜索结果页。

### 3.6 徽章样式（show_ranking/style.css）

```css
.easyscholar-ranking{display:inline-block;padding:3px 9px 2px;border-radius:9px;
  font-size:13px;color:#fff;white-space:nowrap}
.easyscholar-1{background:#f5f} .easyscholar-2{background:#b94a48}
.easyscholar-3{background:#f89406} .easyscholar-4{background:#468847}
.easyscholar-5{background:#5af}
```

颜色/字体/粗细可在设置页自定义（`chrome.storage.local`），渲染后统一用 `U() q() L() B() E()` 重刷样式。

## 4. service_worker.js 其他职责

- 各类翻译代理：`trans_google` / `trans_google_mirro` / `trans_keyan` / `trans_sougou` / `trans_youdao` / `trans_caiyunweb` / `trans_xiaoniu`(需自填 apikey) / `trans_reverso` / `trans_yandex`。
- `check_version`：每 3 天访问 `easyscholar.cc/extension/checkVersion` 验证登录/付费状态（这也是收费门之一）。
- `getSciLink`、`getPaperAllType`、`insertPaper`（文献收藏）、`showInfo` 等其他服务端接口。

翻译功能与标注功能相互独立，新扩展可只做标注、不做翻译。

## 5. 对新扩展的直接启示

1. **注入框架可以整体复用思路**：站点识别（URL+DOM 特征）→ 占位 span → 查本地库 → 徽章渲染 → 轮询重扫，这套模式与数据源解耦，把 `getPapersRank` 从"发 HTTP"换成"查本地数据"即可。
2. `utils.js` 中 157 个站点的采集函数选择器是最大资产，但全部依赖 jQuery 且针对旧版页面，需逐个验证仍有效（如 CNKI、Scopus 已多次改版）。
3. 幂等设计（`easyScholarPaperFlag` 占位标记 + 定时重扫）值得原样保留。
4. 等级 key 命名（`sci`、`sciif`、`sciUp`、`xr`…）可与 ShowJCR 数据表自然对应，见《ShowJCR-数据资产说明.md》。
