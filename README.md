# VeridionTec — Corporate Site + Intelligence Feed

Marketing site for VeridionTec ("Powering the Backbone of Modern Enterprise"),
a vendor-neutral technology & security advisory firm.

## Pages
- `index.html` — corporate homepage (services, why-us, industries, process, insights, contact)
- `news.html` — **Security & Technology Intelligence** dashboard (live daily feed)
- `styles.css` — shared design system (light enterprise theme, green/charcoal)
- `logo-mark.svg` — VT monogram

## Intelligence feed pipeline
- `news-fetch.mjs` — pulls Google News RSS across 6 security/tech topics,
  normalizes + dedupes + categorizes, writes `news-data.js`
  (`window.VT_NEWS = {...}`). No API key required.
- `news-data.js` — generated data the dashboard reads (works file:// and hosted).
- Refreshed daily by an OpenClaw cron (`veridiontec-news-refresh`, 06:00 ET).

To rebuild manually:
```
node news-fetch.mjs
```
