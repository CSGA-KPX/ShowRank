# 扩展 vs Userscript 形态决策

> 2026-10-07 补充于可行性评估之后。结论：**MVP 采用 userscript，扩展作为可选的后续形态**。

## 决策结论

做 **userscript（Tampermonkey / Violentmonkey 脚本）**，不做第一阶段的浏览器扩展。理由按权重排序：

1. **数据更新模式（决定性）**：数据每年更新 2–3 次（新锐 3 月、JCR 6 月、中科院年末）。userscript 把数据文件放 GitHub + jsDelivr，只发数据不发脚本，用户无感；扩展每次更新数据都要重新发版，Firefox 还须重新 AMO 签名。
2. **零工具链**：userscript 一个 .js 文件即成品。本机当前无 node/npm，扩展的签名打包（web-ext / AMO）暂时做不了；unpacked 临时加载虽也不要 node，但见下条。
3. **分发门槛**：Firefox 任何长期安装的扩展必须经 AMO 签名（自托管 XPI 也一样），Chrome 上架需 $5 开发者账号 + 审核。userscript 发 greasyfork 免审核，双浏览器通用。
4. **功能上扩展并非必需**：easyScholar 做成扩展是因为它要调服务端 API + 翻译代理（需 background 绕 CORS）。本项目标注功能**纯本地查表、零网络依赖**；即使拉数据也可用 `GM_xmlhttpRequest` 绕 CORS。翻译聚合若将来要做，userscript 同样可行。

## 对比表

| 维度 | Userscript | 扩展 (MV3) |
|---|---|---|
| 构建工具链 | 零依赖，单 .js 文件 | unpacked 加载零依赖；发布需 web-ext/签名 |
| 数据装载 | 首启从 jsDelivr 拉 JSON，缓存 GM_setValue（Tampermonkey 持 `unlimitedStorage`，数 MB 可行） | JSON 打包进 `web_accessible_resources` |
| 数据更新 | 只更新数据文件（URL 带版本号） | 重新发版 +（Firefox）重新签名 |
| 跨浏览器 | Chrome/Firefox/Edge/Safari 脚本管理器通用 | 双端分别适配签名/商店 |
| 常驻后台 | 无（本项目不需要） | 有 service worker（本项目用不到） |
| 站点适配成本 | **与形态无关**，大头是 157 个站点选择器验证 | 同左 |
| 劣势 | 存储额度依赖脚本管理器（换 Greasemonkey 有差异）；功能上限低于扩展 | 签名/审核是持续维护负担 |

## userscript 的具体设计要点

```js
// ==UserScript==
// @match        https://scholar.google.com/*
// @match        https://pubmed.ncbi.nlm.nih.gov/*
// @connect      cdn.jsdelivr.net        // GM_xmlhttpRequest 拉数据
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
```

- **数据更新机制**：数据 JSON 以 `https://cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/data/rank-v2025.1.json` 形式发布；脚本内置数据版本号，本地缓存与远程版本不一致时重新拉取并 `GM_setValue` 缓存。
- **CSP**：userscript 以 content script 方式执行，不受页面 CSP 限制，DOM 注入（占位 span + 徽章）与扩展等价。
- **兼容性注意**：`GM_setValue` 大字符串存储在 Tampermonkey 上可靠（`unlimitedStorage`）；若目标用户用 Violentmonkey 一般也可行，但应在 README 注明推荐 Tampermonkey。
- **核心代码与形态解耦**：查询/归一化/渲染写成不依赖脚本管理器 API 的纯模块（仅数据加载与存储薄适配一层），将来套扩展壳时整体复用。

## 何时回头做扩展

- 需要常驻后台做聚合翻译、跨站点缓存共享等 userscript 做不好的事；
- 想要商店一键安装体验、面向更大用户群分发；
- 需要突破脚本管理器存储/权限限制。

届时再装 Node.js，用 web-ext 打包 + AMO 签名即可，核心模块零改动。
