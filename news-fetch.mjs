#!/usr/bin/env node
/* VeridionTec — Security & Technology intelligence feed builder.
 *
 * Pulls Google News RSS across security/tech topics (no API key needed),
 * normalizes + dedupes + categorizes, and writes news-data.js as
 *   window.VT_NEWS = { generatedAt, window, items:[...], categories:[...] }
 * The dashboard loads that file directly (works from file:// and when hosted).
 *
 * Run:  node news-fetch.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));

// Security-first, with technology coverage. Order = display order.
const TOPICS = [
  { cat: 'Cybersecurity',        q: 'cybersecurity',                    when: '1d' },
  { cat: 'Data Breaches',        q: 'data breach',                      when: '2d' },
  { cat: 'Vulnerabilities',      q: 'security vulnerability OR CVE OR exploit', when: '2d' },
  { cat: 'Ransomware',           q: 'ransomware attack',                when: '2d' },
  { cat: 'Cloud & Infrastructure', q: 'cloud security OR data center security', when: '2d' },
  { cat: 'AI & Enterprise Tech', q: 'enterprise technology OR AI security', when: '1d' },
];

const RSS = (q, when) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:' + when)}&hl=en-US&gl=US&ceid=US:en`;

const PER_CAT = 14;     // cap per category before global merge
const TOTAL_CAP = 72;   // overall cap

function decode(s = '') {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&apos;/g, "'");
}
const stripTags = (s = '') => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? m[1] : '';
};

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function parseItems(xml, cat) {
  const out = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const b of blocks) {
    const rawTitle = decode(tag(b, 'title')).trim();
    const link = decode(tag(b, 'link')).trim();
    const pub = decode(tag(b, 'pubDate')).trim();
    const srcM = b.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i);
    const source = srcM ? decode(srcM[2]).trim() : '';
    const srcUrl = srcM ? srcM[1] : link;
    // Google News titles are "Headline - Source"; split off the trailing source.
    let title = rawTitle, derivedSource = source;
    const dash = rawTitle.lastIndexOf(' - ');
    if (dash > 24 && !source) { title = rawTitle.slice(0, dash); derivedSource = rawTitle.slice(dash + 3); }
    else if (dash > 24 && source && rawTitle.endsWith(' - ' + source)) { title = rawTitle.slice(0, dash); }
    const ts = pub ? Date.parse(pub) : NaN;
    if (!title || !link || Number.isNaN(ts)) continue;
    out.push({
      title,
      link,
      source: derivedSource || hostOf(srcUrl) || 'News',
      domain: hostOf(srcUrl) || hostOf(link),
      published: new Date(ts).toISOString(),
      ts,
      category: cat,
    });
  }
  return out.slice(0, PER_CAT);
}

async function fetchTopic(t) {
  try {
    const res = await fetch(RSS(t.q, t.when), {
      headers: { 'User-Agent': 'Mozilla/5.0 (VeridionTec NewsBot)' },
    });
    if (!res.ok) { console.warn(`  ${t.cat}: HTTP ${res.status}`); return []; }
    const xml = await res.text();
    const items = parseItems(xml, t.cat);
    console.log(`  ${t.cat.padEnd(22)} ${items.length} stories`);
    return items;
  } catch (e) {
    console.warn(`  ${t.cat}: ${e.message}`);
    return [];
  }
}

function normKey(it) {
  return it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
}

(async () => {
  console.log('VeridionTec · building security & tech feed…');
  const batches = await Promise.all(TOPICS.map(fetchTopic));
  const seen = new Set();
  let items = [];
  // interleave-priority: keep category order but dedupe globally by title
  for (const batch of batches) {
    for (const it of batch) {
      const k = normKey(it);
      if (k.length < 8 || seen.has(k)) continue;
      seen.add(k);
      items.push(it);
    }
  }
  items.sort((a, b) => b.ts - a.ts);
  items = items.slice(0, TOTAL_CAP).map(({ ts, ...rest }) => rest);

  const now = Date.now();
  const last24 = items.filter(i => now - Date.parse(i.published) < 86400000).length;
  const cats = [];
  for (const t of TOPICS) {
    const n = items.filter(i => i.category === t.cat).length;
    if (n) cats.push({ name: t.cat, count: n });
  }

  const payload = {
    generatedAt: new Date(now).toISOString(),
    window: '24–48h',
    total: items.length,
    last24,
    sources: new Set(items.map(i => i.source)).size,
    categories: cats,
    items,
  };

  const js = '/* Auto-generated by news-fetch.mjs — do not edit by hand. */\n' +
    'window.VT_NEWS = ' + JSON.stringify(payload, null, 2) + ';\n';
  writeFileSync(join(__dir, 'news-data.js'), js);
  console.log(`\n✓ ${items.length} stories · ${payload.sources} sources · ${last24} in last 24h`);
  console.log('✓ wrote news-data.js');
})();
