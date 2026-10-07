# ShowJCR 数据资产说明

> 分析对象：`ShowJCR-src/`（Qt/C++ 桌面程序源码）与 `ShowJCR-release/`（Windows 可执行版）
> 分析日期：2026-10-07

## 1. 项目性质

ShowJCR 是一个**本地桌面查询工具**（Qt6 + SQLite），输入期刊名查询各数据源的分区与影响因子。它不是浏览器扩展，但它的数据资产（CSV + jcr.db）正是新扩展最需要的离线数据源。

## 2. 数据来源（README 摘录）

| 数据 | 来源 | 年份 |
|---|---|---|
| 新锐期刊分区表 | https://www.xr-scholar.com | 2026 版（22299 种期刊 + 15 种会议），预警刊标 "Under Review" |
| 中科院分区表升级版 | advanced.fenqubiao.com | 2021/2022/2023/2025 |
| JCR 影响因子与分区 | JCR 官方发布 | 2025 版（2026-06-17 发布），保留 2024 对比 |
| 国际预警期刊名单 | ewl.fenqubiao.com | 2020/2021/2023/2024/2025（每年仅几十条） |
| CCF 推荐目录 / CCF-T 分级 | ccf.org.cn | 2019/2022/2026、2022/2025 |

## 3. 原始数据文件（`中科院分区表及JCR原始数据文件/`）

### 3.1 CSV 清单与规模（行数含表头）

| 文件 | 行数 | 说明 |
|---|---|---|
| `FQBJCR2025-UTF8.csv` | 21773 | 中科院升级版 2025（全量） |
| `FQBJCR2023-UTF8.csv` | 13813 | 中科院升级版 2023 |
| `FQBJCR2022-UTF8.csv` | 12360 | 中科院升级版 2022 |
| `FQBJCR2021-UTF8.csv` | 12423 | 中科院升级版 2021 |
| `JCR2025-UTF8.csv` | 22644 | JCR 2025 |
| `JCR2024-UTF8.csv` | 22250 | JCR 2024 |
| `JCR2020~2023` | 13049~21849 | 历史 JCR |
| `XR2026-UTF8.csv` | 22300 | 新锐 2026 |
| `CCF2026-UTF8.csv` | 682 | CCF 2026 |
| `CCFT2025-UTF8.csv` | 69 | CCF-T 2025 |
| `GJQKYJMD20xx.csv` | 6~66 | 国际预警名单（仅预警刊） |

### 3.2 关键表头结构

**FQBJCR（中科院升级版）**——`Journal,年份,ISSN/EISSN,Review,OA Journal Index（OAJ）,Open Access,Web of Science,标注,大类,大类分区,Top,小类1,小类1分区,...,小类6,小类6分区`（2025 版；2021–2023 无"标注"列，ISSN 列名为 `ISSN`）

**JCR2025**——`Journal,ISSN,EISSN,Web of Science,IF(2025),Category_1,IF Quartile(2025)_1,IF Rank(2025)_1,...,Category_6,...`（最多 6 个学科）
JCR2024 单学科：`Journal,ISSN,eISSN,Category,IF(2024),IF Quartile(2024),IF Rank(2024)`

**XR2026（新锐）**——`Journal,年份,预警标记,刊名,中文刊名,CN,ISSN,EISSN,出版机构,语种,期刊类型,数据库,标注,大类英文名,大类中文名,大类新锐分区,Top,大类2英文名,...,小类1英文名,小类1中文名,小类1新锐分区,...`（最多 2 个大类 + 6 小类）

**CCF2026**——`刊物名称,Journal,年份,出版社,网址,领域,CCF推荐类别（国际学术刊物/会议）,CCF推荐类型`
**GJQKYJMD2025**——`Journal,预警原因（2025）`

### 3.3 通用约定（README 明确）

- 每张表必须含 **`Journal` 字段**，是默认搜索字段；若 `Journal` 不是第一列，则它前面的列也作为搜索字段。
- 因此 CCF 表可以用"刊物简称/中文刊名"反查英文全称。

## 4. jcr.db（SQLite）

- 源码目录版 22 MB，release 版 16 MB（表集合略少）。
- 表名与 CSV 对应：`FQBJCR2025`、`FQBJCR2023`、`FQBJCR2022`、`FQBJCR2021`、`JCR2025`、`JCR2024`、`XR2026`、`XR2026Conferences`、`CCF2026`、`CCFT2025`、`GJQKYJMD2020~2025` 等（已用二进制方式核对建表语句，字段与 CSV 表头一致）。
- 建表无索引、无主键，纯 `TEXT` 列（`sqlitedb.cpp` 靠全表 `SELECT` 加载期刊名做自动补全）。
- 导入脚本：`scripts/import-fqbjcr.py`（Python3，CSV→SQLite，DROP 后重建；只覆盖 FQBJCR2021–2023）。其余表需用 DB Browser for SQLite 手动导入或扩展脚本。
- 查询匹配（`sqlitedb.cpp:65`）：`select * from T where Journal = 'x' COLLATE NOCASE`——**不区分大小写的精确匹配**，无模糊；前端用 QCompleter 对已加载刊名列表做前缀补全。
- `py/query.py`：独立的 pandas + fuzzywuzzy 模糊查询示例脚本，可作为"模糊匹配"参考实现。

## 5. 许可证

`ShowJCR-src/LICENSE` 为 **GPLv3**。代码衍生必须开源；数据本身（JCR/中科院/新锐分区表）版权归各自发布方， easyScholar 与 ShowJCR 均为社区整理再分发。新扩展若直接打包 jcr.db 数据，注意数据来源合规风险（自用/内部传播风险低，公开发布需谨慎评估）。

## 6. 对新扩展的数据供给方案

| 方案 | 做法 | 体积 | 复杂度 |
|---|---|---|---|
| A. 预处理 JSON | 构建时从 CSV 抽取所需字段（刊名→{分区,IF,...}），打包进扩展 | 精简后约 3–6 MB（FQBJCR2025+JCR2025+XR2026 核心字段） | 低，推荐 |
| B. sql.js / wa-sqlite | 直接打包 jcr.db，浏览器内跑 SQLite | 16–22 MB | 中，查询能力完整但体积大 |
| C. IndexedDB | 首次运行导入 JSON 到 IndexedDB | 同 A，运行时构建索引 | 中，查询灵活 |

方案 A 配合一个 `{ 归一化刊名: [FQBJCR2025行, JCR2025行, XR2026行] }` 的映射，content script 里 `O(1)` 查表即可，无需异步。
