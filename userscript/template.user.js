// ==UserScript==
// @name         ShowJCR Rank
// @namespace    local.showjcr-rank
// @version      0.1.0
// @description  在 Google Scholar / PubMed 旁标注期刊中科院分区、JCR 影响因子/分区、新锐分区（离线数据，源自 ShowJCR 整理的公开数据）
// @match        https://*/*
// @connect      cdn.jsdelivr.net
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  // ===================== 配置 =====================
  // 远程数据地址；留空则使用构建时内嵌的数据。
  // 数据格式见 dist/rank-data.json，由 tools/build-data.fsx 生成。
  const DATA_URL = '';
  const DATA_KEY = 'sjcr:data';        // GM_setValue 缓存键
  const SHOW = { fqb: true, jcr: true, xr: true };  // 分别显示：中科院分区 / JCR / 新锐

  // ===================== 数据 =====================
  // 构建工具会把 rank-data.json 注入到下面这个占位符处。
  const EMBED_DATA = /*__DATA__*/null/*__DATA__*/;

  let MAP = null;   // { 归一化刊名: [fqbQu, fqbTop, jcrIF, jcrQu, xrQu, xrTop, xrWarn] }
  let ALIAS = null; // { 归一化缩写/别名: 归一化刊名主键 }（源自 NLM jourcache.xml）
  let PREFIX_BUCKETS = null;  // 首词桶索引，用于截断刊名的唯一前缀匹配

  function normalize(s) {
    return String(s || '')
      .toUpperCase()
      .replace(/&/g, ' AND ')
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function setData(json) {
    MAP = (json && json.journals) || {};
    ALIAS = (json && json.alias) || {};
    // 前缀匹配索引：按首词分桶（截断刊名用，桶内扫描量小）
    PREFIX_BUCKETS = {};
    for (const k in MAP) {
      const w = k.split(' ')[0];
      (PREFIX_BUCKETS[w] = PREFIX_BUCKETS[w] || []).push(k);
    }
    for (const k in ALIAS) {
      const w = k.split(' ')[0];
      (PREFIX_BUCKETS[w] = PREFIX_BUCKETS[w] || []).push(k);
    }
  }

  function loadRemote() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: DATA_URL,
      onload: function (resp) {
        try {
          const json = JSON.parse(resp.responseText);
          GM_setValue(DATA_KEY, resp.responseText);
          setData(json);
          scan();
        } catch (e) { console.warn('[ShowJCR] 数据解析失败', e); }
      },
      onerror: function () { console.warn('[ShowJCR] 数据下载失败'); }
    });
  }

  function initData() {
    if (DATA_URL) {
      const cached = GM_getValue(DATA_KEY, null);
      if (cached) { try { setData(JSON.parse(cached)); scan(); } catch (e) { /* 重新拉取 */ } }
      loadRemote();  // 总是后台刷新一次（简单策略：每次页面加载都拉）
    } else {
      setData(EMBED_DATA);
    }
  }

  // ===================== 渲染 =====================
  const CSS = [
    '.sjcr-flag{display:none}',
    '.sjcr-badge{display:inline-block;padding:1px 7px;margin-left:6px;border-radius:8px;',
    'font-size:12px;line-height:1.7;color:#fff;white-space:nowrap;vertical-align:middle;',
    'font-family:Arial,Helvetica,sans-serif}',
    '.sjcr-fqb-1,.sjcr-qu-1{background:#c0392b}',
    '.sjcr-fqb-2,.sjcr-qu-2{background:#e67e22}',
    '.sjcr-fqb-3,.sjcr-qu-3{background:#2980b9}',
    '.sjcr-fqb-4,.sjcr-qu-4{background:#27ae60}',
    '.sjcr-if{background:#7f8c8d}',
    '.sjcr-warn{background:#fff;color:#c0392b;border:1px solid #c0392b;font-weight:bold}',
    '.sjcr-wait{background:#95a5a6;font-style:italic;cursor:help}'
  ].join('');

  function injectCss() {
    if (document.getElementById('sjcr-style')) return;
    const st = document.createElement('style');
    st.id = 'sjcr-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function badge(cls, text) {
    const b = document.createElement('span');
    b.className = 'sjcr-badge ' + cls;
    b.textContent = text;
    return b;
  }

  // row: [fqbQu, fqbTop, jcrIF, jcrQu, xrQu, xrTop, xrWarn]
  function renderBadges(flag, row) {
    const box = document.createElement('span');
    box.className = 'sjcr-box';
    if (SHOW.fqb && row[0]) {
      box.appendChild(badge('sjcr-fqb-' + row[0], '中科院' + row[0] + '区' + (row[1] ? ' TOP' : '')));
    }
    if (SHOW.jcr) {
      if (row[2]) box.appendChild(badge('sjcr-if', 'IF ' + row[2]));
      if (row[3]) box.appendChild(badge('sjcr-qu-' + row[3][1], 'JCR ' + row[3]));
    }
    if (SHOW.xr) {
      if (row[4]) box.appendChild(badge('sjcr-fqb-' + row[4], '新锐' + row[4] + '区' + (row[5] ? ' TOP' : '')));
      if (row[6]) box.appendChild(badge('sjcr-warn', row[6]));
    }
    if (box.childNodes.length > 0) flag.parentNode.insertBefore(box, flag.nextSibling);
  }

  function lookup(name) {
    if (!MAP) return null;
    const key = normalize(name);
    // 截断刊名（GS 过长显示 …）：禁用精确/别名匹配防误标，只做唯一前缀匹配
    if (name.indexOf('…') !== -1) return prefixLookup(key);
    if (MAP[key]) return MAP[key];
    let alt = null;
    if (key.indexOf('THE ') === 0) alt = MAP[key.substring(4)];   // NLM 带 The 前缀的兜底
    if (alt) return alt;
    const target = ALIAS && ALIAS[key];   // 缩写/别名 → 主键
    return target ? (MAP[target] || null) : null;
  }

  // 唯一前缀匹配："PLANT CELL AND" 之类的前缀在所有键中只对应一个刊才命中
  function prefixLookup(key) {
    const words = key.split(' ');
    if (words.length < 2) return null;            // 单词前缀歧义太大，放弃
    const bucket = PREFIX_BUCKETS && PREFIX_BUCKETS[words[0]];
    if (!bucket) return null;
    const uniq = new Set();
    for (let i = 0; i < bucket.length; i++) {
      const k = bucket[i];
      if (k.indexOf(key) === 0) uniq.add(MAP[k] ? k : ALIAS[k]);
    }
    if (uniq.size !== 1) return null;
    const target = uniq.values().next().value;
    return MAP[target] || null;
  }

  // ===================== 站点适配 =====================
  // 每个适配器: match(host, path) -> bool；scan() -> [{flag, name}]（已插入幂等标记 flag）
  const sites = [
    {
      name: 'GoogleScholar',
      match: function (host, path) {
        return /^scholar\.google\./.test(host) && path.indexOf('/scholar') === 0;
      },
      scan: function () {
        const items = [];
        const ris = document.querySelectorAll('div.gs_ri');
        for (let i = 0; i < ris.length; i++) {
          const ri = ris[i];
          if (ri.querySelector('.sjcr-flag')) continue;
          const titleEl = ri.querySelector('h3.gs_rt');
          const citeEl = ri.querySelector('div.gs_a');
          if (!titleEl || !citeEl) continue;
          // 引用行格式: "作者 - 刊名, 年份 - 出版方"，刊名可能为缩写
          const m = citeEl.textContent.match(/- .*?(?=, \d{4})/);
          if (!m) continue;
          const name = m[0].substring(2).trim();
          const flag = document.createElement('span');
          flag.className = 'sjcr-flag';
          titleEl.parentNode.insertBefore(flag, titleEl.nextSibling);
          if (name.indexOf('…') !== -1) {
            // 截断条目：先唯一前缀匹配；歧义则排队等 cite 接口恢复全名
            const row = prefixLookup(normalize(name));
            if (row) { renderBadges(flag, row); continue; }
            const cid = (ri.parentElement && ri.parentElement.getAttribute('data-cid')) || '';
            if (cid) {
              flag.dataset.sjcrCid = cid;
              const wait = badge('sjcr-wait', '…');   // 占位：正在解析
              wait.title = 'ShowJCR: 正在通过引用接口解析刊名';
              flag.parentNode.insertBefore(wait, flag.nextSibling);
              citeQueue.push({ flag: flag, wait: wait });
            }
            continue;
          }
          items.push({ flag: flag, name: name });
        }
        scheduleCiteQueue();
        return items;
      }
    },
    {
      name: 'BaiduXueshu',
      match: function (host) { return host === 'xueshu.baidu.com'; },
      scan: function (path) {
        const items = [];
        const isDetail = path.indexOf('/usercenter/paper/') === 0 || path.indexOf('/ndscholar/') === 0;
        if (isDetail) {
          // 顶部论文信息区
          const tips = document.querySelector('.ant-spin-container .info-wrap .tips');
          if (tips && !tips.querySelector('.sjcr-flag')) {
            const a = tips.querySelector('a');
            if (a && a.textContent.trim()) {
              const flag = document.createElement('span');
              flag.className = 'sjcr-flag';
              tips.appendChild(flag);
              items.push({ flag: flag, name: a.textContent.trim() });
            }
          }
          // 相关文献列表
          const rows = document.querySelectorAll('.list-wrap-item');
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.querySelector('.sjcr-flag')) continue;
            const titleEl = row.querySelector('a.title');
            const jEl = row.querySelector('.message .journal');
            if (!titleEl || !jEl) continue;
            const flag = document.createElement('span');
            flag.className = 'sjcr-flag';
            titleEl.parentNode.insertBefore(flag, titleEl.nextSibling);
            items.push({ flag: flag, name: jEl.textContent.replace(/[《》]/g, '').trim() });
          }
          return items;
        }
        // 搜索结果页（新版 .paper-info / 旧版 .sc_info 两种 DOM）
        const results = document.querySelectorAll('div.result');
        for (let i = 0; i < results.length; i++) {
          const ri = results[i];
          if (ri.querySelector('.sjcr-flag')) continue;
          const titleEl = ri.querySelector('h3.paper-title') || ri.querySelector('h3.t a');
          if (!titleEl) continue;
          let name = '';
          const ja = ri.querySelector(".paper-info a[href*='data/journal']");
          if (ja) name = ja.textContent;
          if (!name) {
            const spans = ri.querySelectorAll('.paper-info span');
            for (let j = 0; j < spans.length; j++) {
              if (spans[j].textContent.indexOf('《') !== -1) { name = spans[j].textContent; break; }
            }
          }
          if (!name) {
            const old = ri.querySelector('.sc_info span a[title]') || ri.querySelector('.sc_info span a');
            if (old) name = old.getAttribute('title') || old.textContent;
          }
          name = name.replace(/[《》]/g, '').trim();
          if (!name) continue;
          const flag = document.createElement('span');
          flag.className = 'sjcr-flag';
          titleEl.parentNode.insertBefore(flag, titleEl.nextSibling);
          items.push({ flag: flag, name: name });
        }
        return items;
      }
    },
    {
      name: 'ScienceDirect',
      match: function (host) { return host === 'www.sciencedirect.com'; },
      scan: function (path) {
        const items = [];
        if (path.indexOf('/science/article/') === 0) {
          // 详情页：只标注文章头（参考文献/引用列表暂不处理）
          const title = document.querySelector('#screen-reader-main-title') ||
                        document.querySelector('h1');
          const j = document.querySelector('article .publication-title-link') ||
                    document.querySelector("h2[data-aa-region='publication-title']");
          if (title && j && !title.querySelector('.sjcr-flag')) {
            const flag = document.createElement('span');
            flag.className = 'sjcr-flag';
            title.appendChild(flag);
            items.push({ flag: flag, name: j.textContent.trim() });
          }
          return items;
        }
        // 搜索结果页
        const rows = document.querySelectorAll('li.ResultItem');
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (row.querySelector('.sjcr-flag')) continue;
          const titleEl = row.querySelector('h2 > span');
          const j = row.querySelector("a[data-aa-name*='srp-srctitle-']");
          if (!titleEl || !j) continue;
          const flag = document.createElement('span');
          flag.className = 'sjcr-flag';
          titleEl.parentNode.insertBefore(flag, titleEl.nextSibling);
          items.push({ flag: flag, name: j.textContent.trim() });
        }
        return items;
      }
    },
    {
      name: 'IEEE',
      match: function (host) { return host === 'ieeexplore.ieee.org'; },
      scan: function (path) {
        const items = [];
        if (path.indexOf('/document/') === 0) {
          // 详情页
          const title = document.querySelector('h1.document-title span');
          const j = document.querySelector('div.stats-document-abstract-publishedIn > a');
          if (title && j && !title.querySelector('.sjcr-flag')) {
            const flag = document.createElement('span');
            flag.className = 'sjcr-flag';
            title.parentNode.insertBefore(flag, title.nextSibling);
            items.push({ flag: flag, name: j.textContent.trim() });
          }
          return items;
        }
        // 搜索结果页
        const rows = document.querySelectorAll('xpl-results-list div.List-results-items');
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (row.querySelector('.sjcr-flag')) continue;
          const titleEl = row.querySelector('h3.text-md-md-lh');
          const j = row.querySelector('div.hide-mobile div.result-item-align div.description a');
          if (!titleEl || !j) continue;
          const flag = document.createElement('span');
          flag.className = 'sjcr-flag';
          titleEl.appendChild(flag);
          items.push({ flag: flag, name: j.textContent.trim() });
        }
        return items;
      }
    },
    {
      name: 'SemanticScholar',
      match: function (host) { return host === 'www.semanticscholar.org'; },
      scan: function () {
        const items = [];
        const rows = document.querySelectorAll('#main-content div.result-page > div.cl-paper-row');
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (row.querySelector('.sjcr-flag')) continue;
          const titleEl = row.querySelector('.link-button--show-visited');
          const j = row.querySelector('.cl-paper__bulleted-row__item > a > span');
          if (!titleEl || !j) continue;
          const flag = document.createElement('span');
          flag.className = 'sjcr-flag';
          titleEl.parentNode.insertBefore(flag, titleEl.nextSibling);
          items.push({ flag: flag, name: j.textContent.trim() });
        }
        return items;
      }
    },
    {
      name: 'Dblp',
      match: function (host) { return host === 'dblp.org'; },
      scan: function () {
        const items = [];
        const rows = document.querySelectorAll('.publ-list li.entry');
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const cls = row.getAttribute('class') || '';
          if (cls.indexOf('article') === -1 && cls.indexOf('inproceedings') === -1) continue;
          if (row.querySelector('.sjcr-flag')) continue;
          const citeEl = row.querySelector('cite.data');
          const j = row.querySelector("a span[itemprop='isPartOf'] span[itemprop='name']");
          if (!citeEl || !j) continue;
          const flag = document.createElement('span');
          flag.className = 'sjcr-flag';
          citeEl.appendChild(flag);
          items.push({ flag: flag, name: j.textContent.trim() });
        }
        return items;
      }
    },
    {
      name: 'PubMed',
      match: function (host) { return host === 'pubmed.ncbi.nlm.nih.gov'; },
      scan: function (path) {
        const items = [];
        const isDetail = /^\/?\d+(\.\d+)?\/?$/.test(path);
        if (isDetail) {
          // 详情页：标题 + 期刊全称按钮
          const title = document.querySelector('h1.heading-title');
          const jbtn = document.querySelector('button.journal-actions-trigger');
          if (title && jbtn && !title.querySelector('.sjcr-flag')) {
            const flag = document.createElement('span');
            flag.className = 'sjcr-flag';
            title.appendChild(flag);
            items.push({ flag: flag, name: jbtn.textContent.trim() });
          }
        } else {
          // 列表页：article.full-docsum
          const arts = document.querySelectorAll('article.full-docsum');
          for (let i = 0; i < arts.length; i++) {
            const art = arts[i];
            if (art.querySelector('.sjcr-flag')) continue;
            const titleEl = art.querySelector('a.docsum-title');
            const citEl = art.querySelector('span.full-journal-citation');
            if (!titleEl || !citEl) continue;
            // 优先用 title 属性里的完整刊名（可见文本常被缩写替换）
            let name = (citEl.getAttribute('title') || citEl.textContent).split('.')[0];
            const flag = document.createElement('span');
            flag.className = 'sjcr-flag';
            titleEl.parentNode.insertBefore(flag, titleEl.nextSibling);
            items.push({ flag: flag, name: name.trim() });
          }
        }
        return items;
      }
    }
  ];

  function currentSite() {
    const host = location.hostname;
    const path = location.pathname;
    for (let i = 0; i < sites.length; i++) {
      if (sites[i].match(host, path)) return sites[i];
    }
    return null;
  }

  // ===================== Google Scholar cite 兜底 =====================
  // 截断条目（刊名含 …）通过 cite 接口恢复全名；串行 + 随机延迟降低反爬风险
  let citeQueue = [];
  let citeRunning = false;

  function scheduleCiteQueue() {
    if (citeRunning || citeQueue.length === 0) return;
    citeRunning = true;
    processNextCite();
  }

  function processNextCite() {
    const item = citeQueue.shift();
    if (!item) { citeRunning = false; return; }
    if (!item.flag.isConnected) { processNextCite(); return; }  // 条目已翻页移除
    const delay = 600 + Math.random() * 600;
    setTimeout(function () {
      const url = '/scholar?q=info:' + item.flag.dataset.sjcrCid +
                  ':scholar.google.com/&output=cite&scirp=0&hl=en';
      fetch(url).then(function (r) { return r.text(); }).then(function (html) {
        let row = null;
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const rows = doc.querySelectorAll('tr');
          let journal = '';
          for (let i = 0; i < rows.length; i++) {
            const th = rows[i].querySelector('th.gs_cith');
            if (th && (th.textContent.trim() === 'MLA' || th.textContent.trim() === 'APA')) {
              const it = rows[i].querySelector('div.gs_citr i');
              if (it) { journal = it.textContent.trim(); break; }
            }
          }
          // MLA 的刊名可能带结尾句点
          if (journal && MAP) row = lookup(journal.replace(/\.$/, ''));
        } catch (e) { /* 静默 */ }
        if (item.wait && item.wait.isConnected) item.wait.remove();
        if (row) renderBadges(item.flag, row);
        processNextCite();
      }).catch(function () {
        if (item.wait && item.wait.isConnected) item.wait.remove();
        processNextCite();
      });
    }, delay);
  }

  // ===================== 主流程 =====================
  function scan() {
    if (!MAP) return;
    const site = currentSite();
    if (!site) return;
    injectCss();
    const items = site.scan(location.pathname);
    for (let i = 0; i < items.length; i++) {
      const row = lookup(items[i].name);
      if (row) renderBadges(items[i].flag, row);
    }
  }

  initData();
  scan();
  // SPA / 动态加载：轮询重扫（幂等标记 .sjcr-flag 去重）
  setInterval(scan, 1500);
})();
