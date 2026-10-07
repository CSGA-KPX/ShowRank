# AGENTS.md — sci-jcr 项目

## 项目目标

评估并（若继续推进）实现一个**浏览器扩展**：在文献检索网页（Google Scholar、Pubmed、CNKI、Web of Science 等）的每篇文献旁标注期刊分区与影响因子（中科院分区、JCR IF/Quartile、新锐分区等），替代已开始收费的 easyScholar 扩展。

## 工作区结构

```
easyScholar-xpi-source/   easyScholar 扩展解包源码（MV3，minify）。页面注入逻辑的参考实现。
ShowJCR-src/              ShowJCR 桌面程序源码（Qt6/C++）。核心是 中科院分区表及JCR原始数据文件/ 下的 CSV 与 jcr.db。
ShowJCR-release/          ShowJCR Windows 发布版（ShowJCR.exe + jcr.db 16MB）。
Pubmed/jourcache.xml      NLM 期刊目录缓存（42884 刊：全称/MedAbbr/IsoAbbr/Alias），缩写→全称匹配的数据源。
tools/                    数据管线与验证脚本（F#/pwsh，见下）
userscript/               userscript 模板 template.user.js（数据占位符注入后成产物）
dist/                     构建产物：show-rank.user.js（可安装）、rank-data.json
docs/                     探索与分析文档（先看这里）：
  - easyScholar-页面注入逻辑分析.md
  - ShowJCR-数据资产说明.md
  - 新扩展可行性评估.md
  - 扩展vsUserscript形态决策.md
  - userscript-实现与构建.md          ← MVP 构建/安装/限制
TODO.md                   探索进度与待办
```

## 构建命令（全 .NET 工具链）

```powershell
dotnet fsi tools/build-data.fsx     # CSV+jourcache.xml → dist/rank-data.json
pwsh tools/build-userscript.ps1     # 注入数据 → dist/show-rank.user.js
pwsh tools/verify.ps1               # 静态验证
node-v24.21.0-win-x64\node.exe --check dist\show-rank.user.js  # 语法检查
```

## 当前状态（2026-10-07）

MVP 完成：Google Scholar + PubMed 标注中科院分区/JCR IF/新锐分区，本地 2.9MB 数据，NLM 缩写映射 21965 条，端到端测试 10/10 命中。待浏览器实测。

## 关键结论（详见 docs/）

- easyScholar 收费点在服务端 API `listPublicationRank9`；扩展本体只是"采集期刊名 → 请求 API → 渲染徽章"。
- 注入模式：站点识别(URL+DOM 特征) → 插入占位 span.easyScholarPaperFlag → 查询 → 按 paperID 插彩色徽章 → 定时重扫(1500–3500ms) 保证幂等。
- ShowJCR 数据：`FQBJCR2025`(中科院升级版 21772 刊)、`JCR2025`(IF+Quartile 22643 刊)、`XR2026`(新锐 22299 刊)、`CCF2026`、`GJQKYJMD2025`(预警)。
- 可行方案：构建期 CSV→精简 JSON(3–6MB)，扩展内本地查表，替换 API 调用。
- 最大技术风险：页面给出期刊缩写而数据库是全称，需要归一化+缩写词典/fuzzy 兜底。
- 数据缺口：5 年 IF、JCI（ShowJCR 无）。

## 环境信息

- OS: Windows (powershell)，git 2.50 可用。
- **未安装**：node/npm、python、sqlite3 CLI、make、cmake、docker。需要时请用户安装。
  - 数据管线脚本需要 Python3（或自行改用其他语言）
  - 扩展构建/打包（web-ext、crx/xpi）需要 Node.js
  - jcr.db 手工查看可用 DB Browser for SQLite（GUI，免 CLI）
- easyScholar 与 ShowJCR 的 JS/C++ 均为压缩/混淆源码，以阅读分析为主，不建议直接改动。

## 约定

- 文档统一简体中文，写入 `docs/`，代码/标识符保留原文。
- 分析过程中的中间产物放系统临时目录，不留在仓库。
