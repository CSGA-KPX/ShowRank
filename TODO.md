# TODO.md — 探索状态与待办

> 最后更新：2026-10-07（v0.3 移植 5 个新站点，待真页验证）

## 已完成

- [x] 工作区结构盘点（easyScholar-xpi-source / ShowJCR-src / ShowJCR-release / Pubmed）
- [x] easyScholar 注入逻辑分析（docs/easyScholar-页面注入逻辑分析.md）
- [x] ShowJCR 数据资产分析（docs/ShowJCR-数据资产说明.md）
- [x] 可行性评估（docs/新扩展可行性评估.md）
- [x] 形态决策（docs/扩展vsUserscript形态决策.md）——MVP 用 userscript（Firefox + Tampermonkey）
- [x] 数据管线 `tools/build-data.fsx`（dotnet fsi）：FQBJCR2025+JCR2025+XR2026 → 23113 键
- [x] 缩写映射：集成 NLM `Pubmed/jourcache.xml`（42884 刊，命中 14221），别名 21965 条，歧义丢弃 433 条
- [x] 构建 `tools/build-userscript.ps1` + 验证 `tools/verify.ps1` + node 语法检查
- [x] 端到端测试：PubMed 缩写/带副标题全名/带括号后缀全名 10/10 命中
- [x] 文档 `docs/userscript-实现与构建.md`（构建命令、安装步骤、已知限制）
- [x] **v0.2 修复 GS 截断刊名**：唯一前缀匹配（首词桶索引）+ cite 接口串行兜底（600–1200ms 随机延迟，MLA/APA 行 `<i>` 提取）；截断条目禁用精确匹配防 `Nature …` 误标
- [x] v0.2 实测通过（PubMed 列表/详情正常；GS 截断修复生效，翻页无验证码）
- [x] cite 等待占位符（灰色 `…` 徽标，成功替换/失败移除）
- [x] **v0.3 移植 5 个站点**：百度学术（列表新旧两版+详情）、ScienceDirect（列表+详情）、IEEE Xplore（列表+详情）、Semantic Scholar 列表、dblp；match 逻辑冒烟测试 15 例通过

## 待办 — 真页验证（v0.3，需要人工）

- [ ] 重新安装 `dist/show-rank.user.js`，逐个访问并验证：
  - [ ] 百度学术搜索页 + 论文详情页
  - [ ] ScienceDirect 搜索页 + 文章页（sciencedirect.com/science/article/...）
  - [ ] IEEE Xplore 搜索页 + 文献详情页
  - [ ] Semantic Scholar 搜索页
  - [ ] dblp 搜索页
- [ ] 验证方式：若某站点无徽章，保存页面 HTML 到 `samples/` 文件夹（Ctrl+S 存"网页，仅 HTML"），我据此修正选择器
- [ ] 继续记录未命中刊名样本

## 待办 — 后续迭代

- [ ] 第二批站点（需样本页）：Springer（easyScholar 选择器已过时）、CNKI、万方、维普、X-MOL、WOS、Scopus、ResearchGate
- [ ] 刊名人工映射表（BMJ 等完全不同名刊）
- [ ] 数据远程托管（jsDelivr）+ DATA_URL 自动更新
- [ ] 设置界面（勾选显示哪些等级、颜色主题）
- [ ] （可选）发布 greasyfork

## 环境说明

- 数据管线与构建全部基于 .NET：`dotnet fsi` + pwsh 7，无需 Python/Node
- 本地 node 便携版 `node-v24.21.0-win-x64\node.exe` 可用于 `--check` 语法检查（可选）
