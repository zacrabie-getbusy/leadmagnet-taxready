/**
 * render.js — server-side template rendering for TaxReady firm profiles and city hubs.
 * Ports the logic previously in generate.py and generate_city_pages.py to JavaScript
 * so the Cloudflare Worker can render pages on-demand from D1 data.
 */

const FLAG_TO_SEGMENT = {
  flag_hospitality:            'Hospitality',
  flag_construction:           'Construction',
  flag_healthcare:             'Healthcare',
  flag_media:                  'Media & Creative',
  flag_professional_services:  'Professional Services',
  flag_real_estate:            'Real Estate',
};

export function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function deriveSegments(firm) {
  const override = (firm.specialist_segments || '').trim();
  if (override) return override;
  const segs = [];
  for (const [flag, label] of Object.entries(FLAG_TO_SEGMENT)) {
    const val = (firm[flag] != null ? String(firm[flag]) : '').trim().toUpperCase();
    if (val === 'TRUE' || val === '1' || val === 'YES') segs.push(label);
  }
  return segs.join(', ');
}

function isTruthy(val) {
  return (val != null && String(val).trim() !== '' && String(val).trim() !== '0');
}

export function isClaimed(firm) {
  return firm.is_claimed === 1 || firm.is_claimed === true || String(firm.is_claimed) === '1' ||
         String(firm.is_claimed || '').toUpperCase() === 'TRUE';
}

// ─── Index rules ─────────────────────────────────────────────────────────────
// Mirrored EXACTLY in generate_sitemap.py (is_profile_indexable / hub_tier) so
// the sitemap only lists URLs the Worker serves as `index`. Change both together;
// scripts/check_sitemap_parity.py catches drift.
//
// Profile: indexable if claimed, OR (bio has >= 25 words AND the firm lists
//          specialisms or a website). Everything else is `noindex, follow` but
//          stays live with its enquiry form and claim CTA.
// Hub:     8+ firms → index, "Best" title · 3–7 → index, plain title ·
//          1–2 → `noindex, follow` (still live, still linked).
const WORD_SPLIT = /[ \t\n\r\f\v\u00a0]+/;
export const MIN_BIO_WORDS = 25;
export const HUB_BEST_MIN  = 8;
export const HUB_INDEX_MIN = 3;
export const ROBOTS_INDEX   = 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
export const ROBOTS_NOINDEX = 'noindex, follow';

function hasText(s) {
  return String(s == null ? '' : s).split(WORD_SPLIT).some(Boolean);
}

export function bioWordCount(bio) {
  return String(bio == null ? '' : bio).split(WORD_SPLIT).filter(Boolean).length;
}

export function isProfileIndexable(firm) {
  if (profileHubSlug(firm) === 'other') return false;   // no suburb to canonicalise to
  if (isClaimed(firm)) return true;
  return bioWordCount(firm.bio) >= MIN_BIO_WORDS && (hasText(firm.specialisms) || hasText(firm.website));
}

export function hubTier(firmCount) {
  if (firmCount >= HUB_BEST_MIN)  return 'best';
  if (firmCount >= HUB_INDEX_MIN) return 'index';
  return 'noindex';
}

export function plural(n, one, many) {
  return `${Number(n).toLocaleString('en-GB')} ${n === 1 ? one : many}`;
}

/** Hub <title>: honest about size, "Best" only for 8+ firms. */
export function hubSeoTitle(place, firmCount) {
  const tier = hubTier(firmCount);
  if (tier === 'best')  return `Best Accountants in ${place} (${plural(firmCount, 'firm', 'firms')}) | TaxReady`;
  if (tier === 'index') return `Accountants in ${place} (${plural(firmCount, 'firm', 'firms')}) | TaxReady`;
  return `Accountants in ${place} | TaxReady`;
}

/**
 * Page state, decided server-side with the same rules the template used to
 * apply in the browser. Pending (unclaimed, < 10 reviews) wins over a badge.
 *   1 badge + unclaimed · 2 verified + unclaimed · 3 claimed + badge ·
 *   4 claimed, no badge · 5 pending
 */
export function computeState(firm) {
  const hasBadge = isTruthy(firm.badge_url);
  if (isClaimed(firm)) return hasBadge ? 3 : 4;
  if ((parseInt(firm.reviews, 10) || 0) < 10) return 5;
  return hasBadge ? 1 : 2;
}

/** The hub a firm lives under in URLs: "other"-bucket firms use their suburb. */
export function profileHubSlug(firm) {
  const citySlug = (firm.city_slug || '').trim() || slugify(firm.city || '');
  if (citySlug === 'other' && (firm.suburb_slug || '').trim()) return firm.suburb_slug.trim();
  return citySlug;
}

function splitTags(raw) {
  return String(raw || '').split(TAG_SEP).map(s => s.trim()).filter(Boolean);
}

// ─── Template plumbing ───────────────────────────────────────────────────────

/** Remove the designer preview toolbar + its scripts (TXPREVIEW-START/END). */
export function stripPreviewBlock(html) {
  return html.replace(/<!--\s*TXPREVIEW-START\s*-->[\s\S]*?<!--\s*TXPREVIEW-END\s*-->\n?/g, '');
}

/**
 * Keep only the template blocks that apply to this page:
 *   <!-- STATE:1,3 START --> … <!-- STATE END -->    page state
 *   <!-- COUNTRY:GB START --> … <!-- COUNTRY END --> market
 *   <!-- HAS:BIO START --> … <!-- HAS END -->        firm supplied that field
 * Blocks of different kinds may nest; blocks of the same kind may not.
 * The preview script in the template applies the same rules client-side.
 */
export function stripBlocks(html, { state, country, flags }) {
  const keep = {
    COUNTRY: vals => vals.includes(country),
    STATE:   vals => vals.includes(String(state)),
    HAS:     vals => vals.every(f => flags[f]),
  };
  for (const kind of ['COUNTRY', 'STATE', 'HAS']) {
    const re = new RegExp(`<!--\\s*${kind}:([\\w,]+) START\\s*-->([\\s\\S]*?)<!--\\s*${kind} END\\s*-->`, 'g');
    html = html.replace(re, (_, vals, inner) => (keep[kind](vals.split(',')) ? inner : ''));
  }
  return html;
}

// Tokens whose values are trusted, pre-built HTML/JSON — inserted verbatim
// and before everything else (FOOTER_HTML itself contains {{FIRM_SLUG}}).
const RAW_TOKENS = new Set(['FOOTER_HTML', 'MENU_CITY_LIST', 'MENU_TAX_COL', 'SIMILAR_FIRMS_HTML', 'SCHEMA_JSON',
                            'TAG_CHIPS_HTML', 'CERT_CHIPS_HTML', 'DETAIL_CARDS_HTML']);
const TOKEN_RE = /\{\{([A-Z0-9_]+)\}\}/g;

/**
 * Fill {{TOKENS}} with values escaped for where each token sits: JSON inside
 * ld+json scripts, JS string literals inside other scripts, HTML everywhere
 * else. (A single escaping scheme for all three is how "Bob's" used to become
 * `Bob\'s` — invalid JSON-LD — on the old template.)
 */
export function fillTokens(html, values) {
  html = html.replace(TOKEN_RE, (m, k) => (RAW_TOKENS.has(k) && k in values ? values[k] : m));
  return html.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script>)|\{\{([A-Z0-9_]+)\}\}/g,
    (m, open, attrs, body, close, k) => {
      if (open) {
        const enc = /application\/ld\+json/.test(attrs) ? jsonStr : jsStr;
        return open + body.replace(TOKEN_RE, (t, kk) => (kk in values ? enc(String(values[kk])) : t)) + close;
      }
      return k in values ? esc(String(values[k])) : m;
    });
}

function jsonStr(str) {
  return JSON.stringify(String(str)).slice(1, -1).replace(/</g, '\\u003c');
}

/** JSON for an inline <script type="application/ld+json"> block. */
function ldJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}


function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escape for a single-quoted JS string literal inside an inline <script>. */
function jsStr(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')
    .replace(/</g, '\\x3c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const TITLE_MAX = 60;

/**
 * Profile <title>, at most 60 characters:
 *   "{Firm} – {Qualifier} Accountant in {City} | TaxReady"  (qualifier only if it fits)
 *   "{Firm} – Accountant in {City} | TaxReady"
 * then progressively shorter fallbacks for long firm names.
 */
export function profileTitle(name, city, qualifier) {
  const cands = [];
  if (qualifier) cands.push(`${name} – ${qualifier} Accountant in ${city} | TaxReady`);
  cands.push(`${name} – Accountant in ${city} | TaxReady`,
             `${name} – Accountant in ${city}`,
             `${name} – ${city} | TaxReady`,
             `${name} | TaxReady`);
  for (const t of cands) if (t.length <= TITLE_MAX) return t;
  return name.length <= TITLE_MAX ? name : name.slice(0, TITLE_MAX - 1).trimEnd() + '…';
}

function computeSEO(firm, segments, state, city) {
  const name    = (firm.name || '').trim();
  const rating  = parseFloat(firm.rating) || 0;
  const reviews = parseInt(firm.reviews) || 0;

  let qualifier;
  if (state === 1 || state === 3)          qualifier = 'Top-rated';
  else if (state === 4)                    qualifier = 'Verified';
  else if (state === 5)                    qualifier = '';
  else if (reviews >= 10 && rating >= 4.5) qualifier = 'Highly-rated';
  else if (reviews >= 10 && rating >= 4.0) qualifier = 'Well-reviewed';
  else                                     qualifier = '';

  const speciList = splitTags(segments || firm.specialisms);
  const speciSnip = speciList[0] ? ` specialising in ${speciList[0]}` : '';
  const desc = `${name} is ${qualifier ? 'a ' + qualifier.toLowerCase() + ' ' : 'an '}` +
               `accounting firm in ${city}${speciSnip}. View full profile and get in touch via TaxReady.`;

  // Raw strings — fillTokens() escapes them for HTML / JSON as needed.
  return {
    seoTitle: profileTitle(name, city, qualifier),
    seoDesc:  desc.length > 160 ? desc.slice(0, 157) + '...' : desc,
  };
}

/**
 * LocalBusiness + BreadcrumbList (+ FAQPage) as one @graph. Blank fields are
 * omitted. No aggregateRating: the ratings are Google's, and Google's
 * review-snippet guidelines only allow ratings the site collected itself.
 */
function buildProfileSchema(firm, p) {
  const name     = (firm.name || '').trim();
  const street   = (firm.address || '').trim();
  const postcode = (firm.postcode || '').trim();
  const website  = (firm.website || '').trim();
  const lat = parseFloat(firm.latitude), lng = parseFloat(firm.longitude);
  const knows = splitTags([p.segments, firm.specialisms].filter(Boolean).join(', '));

  const address = { '@type': 'PostalAddress', addressLocality: p.city, addressCountry: p.countryCode };
  if (street)   address.streetAddress = street;
  if (postcode) address.postalCode = postcode;

  const biz = {
    '@type': ['AccountingService', 'LocalBusiness'],
    '@id': p.canonical + '#business',
    mainEntityOfPage: { '@type': 'WebPage', '@id': p.canonical },
    name,
    description: p.description,
    url: p.canonical,
    address,
    areaServed: { '@type': 'City', name: p.city },
    priceRange: p.countryCode === 'GB' ? '££' : '$$',
    currenciesAccepted: p.countryCode === 'US' ? 'USD' : p.countryCode === 'AU' ? 'AUD' : 'GBP',
    paymentAccepted: 'Invoice',
  };
  if (p.hasBadge) biz.image = (firm.badge_url || '').trim();
  if (/^https?:\/\//i.test(website)) biz.sameAs = [website];
  if (isFinite(lat) && isFinite(lng) && (lat || lng)) {
    biz.geo = { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
    biz.hasMap = p.canonical + '#firm-map';
  }
  if (knows.length) biz.knowsAbout = knows;

  const crumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `https://taxready.me/${p.countryDir}/` },
      { '@type': 'ListItem', position: 2, name: `${p.countryLabel} accountants`, item: `https://taxready.me/${p.countryDir}/accounting-firms/` },
      { '@type': 'ListItem', position: 3, name: p.city, item: p.hubUrl },
      { '@type': 'ListItem', position: 4, name, item: p.canonical },
    ],
  };

  const graph = [biz, crumbs];
  if (p.state !== 5) {
    const qa = (q, a) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } });
    const faq = [];
    if (knows.length) faq.push(qa(`What does ${name} specialise in?`,
      `${name} lists ${knows.join(', ')} for clients in ${p.city} and the surrounding area.`));
    faq.push(qa(`How do I contact ${name} in ${p.city}?`,
      `Fill in the enquiry form on this page and your details are passed to ${name}.`));
    if (street) faq.push(qa(`Where is ${name} based?`,
      `${name} is based at ${[street, p.city, postcode].filter(Boolean).join(', ')}.`));
    graph.push({ '@type': 'FAQPage', mainEntity: faq });
  }
  return ldJson({ '@context': 'https://schema.org', '@graph': graph });
}

// ─── Similar firms (profile module) ──────────────────────────────────────────

/**
 * Indexable firms in one hub, best first, slimmed for caching. `rows` are D1
 * rows for the hub (the Worker pre-filters in SQL; the exact rule runs here).
 */
export function similarCandidates(rows, limit = 24) {
  return rows
    .filter(f => isProfileIndexable(f))
    .sort((a, b) => hybridScore(b) - hybridScore(a))
    .slice(0, limit)
    .map(f => ({
      name:    (f.name || '').trim(),
      slug:    (f.firm_slug || '').trim(),
      hub:     profileHubSlug(f),
      rating:  parseFloat_(f.rating),
      reviews: parseInt_(f.reviews),
      segs:    splitTags(deriveSegments(f)),
    }));
}

/** Up to `max` candidates other than `firm`, sharing a segment first. */
export function pickSimilarFirms(firm, candidates, max = 6) {
  const mine = new Set(splitTags(deriveSegments(firm)).map(s => s.toLowerCase()));
  const self = (firm.firm_slug || '').trim();
  const same = [], rest = [];
  for (const c of candidates) {
    if (c.slug === self || c.hub === 'other') continue;
    (c.segs.some(s => mine.has(s.toLowerCase())) ? same : rest).push(c);
  }
  return same.concat(rest).slice(0, max);
}

// ─── Profile facts (server-rendered so they're in the initial HTML) ──────────

function chipLinksHtml(items, cls) {
  return items.map(t => `<a href="#lead-form"><span class="${cls}">${esc(t)}</span></a>`).join('');
}

function detailCardsHtml(firm, segments, city, claimed) {
  const card = (label, val) => `<div class="detail-card"><h4>${label}</h4><p>${esc(val)}</p></div>`;
  const postcode = (firm.postcode || '').trim();
  const cards = [];
  if (hasText(firm.differentiators)) cards.push(card('Differentiators', firm.differentiators.trim()));
  if (city) cards.push(card('Location', city + (postcode ? ', ' + postcode : '')));
  if (hasText(segments)) cards.push(card('Client type', segments));
  cards.push(card('Status', claimed ? 'Profile managed by the firm' : 'Listed on TaxReady'));
  return cards.join('');
}

function similarFirmsHtml(list, city, countryDir, hubSlug) {
  if (!list.length) return '';
  const cards = list.map(f => {
    const meta = [];
    if (f.reviews > 0 && f.rating > 0) {
      meta.push(`<span class="sim-star">&#9733;</span> ${f.rating.toFixed(1)} &middot; ${esc(plural(f.reviews, 'review', 'reviews'))}`);
    }
    if (f.segs[0]) meta.push(esc(f.segs[0]));
    return `<a class="sim-card" href="/${countryDir}/accounting-firms/${f.hub}/${f.slug}/">` +
      `<div class="sim-name">${esc(f.name)}</div>` +
      (meta.length ? `<div class="sim-meta">${meta.join(' &middot; ')}</div>` : '') + `</a>`;
  }).join('');
  return `<section id="similar-firms" aria-labelledby="sim-h">` +
    `<h2 class="sim-h" id="sim-h">Similar firms in ${esc(city)}</h2>` +
    `<div class="sim-grid">${cards}</div>` +
    `<a class="sim-all" href="/${countryDir}/accounting-firms/${hubSlug}/">All accountants in ${esc(city)} &rarr;</a>` +
    `</section>`;
}

/**
 * Build a complete firm profile page from the template and D1 row.
 *
 * @param {string} template - Raw accountant-profile-template.html content
 * @param {object} firm     - D1 row for the firm
 * @param {object} [opts]
 * @param {number} [opts.totalCount] - Country firm count for the footer tagline
 * @param {object[]} [opts.similar]  - similarCandidates() for the firm's hub
 * @returns {string} Complete HTML ready to serve
 */
export function buildFirmProfile(template, firm, opts = {}) {
  const totalCount   = opts.totalCount || 4000;
  const cc           = (firm.country || 'GB').toUpperCase();
  const countryDir   = cc === 'AU' ? 'au' : cc === 'US' ? 'us' : 'uk';
  const countryCode  = cc === 'AU' ? 'AU' : cc === 'US' ? 'US' : 'GB';
  const countryLabel = cc === 'AU' ? 'Australian' : cc === 'US' ? 'US' : 'UK';

  const citySlug = (firm.city_slug || '').trim() || slugify(firm.city || '');
  const firmSlug = (firm.firm_slug || '').trim() || slugify(firm.name || '');
  const displayCity     = (citySlug === 'other' && (firm.suburb || '').trim())
                            ? (firm.suburb || '').trim()
                            : (firm.city   || '').trim();
  const displayCitySlug = profileHubSlug(firm);
  const segments = deriveSegments(firm);
  const state    = computeState(firm);
  const reviews  = parseInt(firm.reviews, 10) || 0;
  const { seoTitle, seoDesc } = computeSEO(firm, segments, state, displayCity);
  const totalCountStr = totalCount >= 1000
    ? Math.floor(totalCount / 1000) + ',000+'
    : String(totalCount) + '+';
  const canonical = `https://taxready.me/${countryDir}/accounting-firms/${displayCitySlug}/${firmSlug}/`;

  // Mega menu columns: country-specific
  const menuCityList = cc === 'GB' ? `
        <li class="mm-sub-title">Popular cities</li>
        <li><a href="/uk/accounting-firms/london/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">London</span></a></li>
        <li><a href="/uk/accounting-firms/manchester/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Manchester</span></a></li>
        <li><a href="/uk/accounting-firms/birmingham/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Birmingham</span></a></li>
        <li><a href="/uk/accounting-firms/leeds/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Leeds</span></a></li>
        <li><a href="/uk/accounting-firms/bristol/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Bristol</span></a></li>
        <li><a href="/uk/accounting-firms/glasgow/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Glasgow</span></a></li>
        <li><a href="/uk/accounting-firms/edinburgh/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Edinburgh</span></a></li>
        <li><a href="/uk/accounting-firms/liverpool/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Liverpool</span></a></li>` : cc === 'US' ? `
        <li class="mm-sub-title">Popular states</li>
        <li><a href="/us/accounting-firms/tx/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Texas</span></a></li>
        <li><a href="/us/accounting-firms/fl/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Florida</span></a></li>
        <li><a href="/us/accounting-firms/ca/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">California</span></a></li>
        <li><a href="/us/accounting-firms/ny/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">New York</span></a></li>
        <li><a href="/us/accounting-firms/nc/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">North Carolina</span></a></li>
        <li><a href="/us/accounting-firms/az/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Arizona</span></a></li>` : cc === 'AU' ? `
        <li class="mm-sub-title">Popular cities</li>
        <li><a href="/au/accounting-firms/sydney/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Sydney</span></a></li>
        <li><a href="/au/accounting-firms/melbourne/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Melbourne</span></a></li>
        <li><a href="/au/accounting-firms/brisbane/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Brisbane</span></a></li>
        <li><a href="/au/accounting-firms/perth/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Perth</span></a></li>
        <li><a href="/au/accounting-firms/adelaide/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Adelaide</span></a></li>` : '';

  const menuTaxCol = cc === 'GB' ? `
    <div class="mm-col">
      <h3 class="mm-title"><span class="mm-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M14.5 8.5c-.5-1-1.5-1.5-2.7-1.5-1.7 0-3 1-3 3v3H8m1 0h5.5M9 16.5h5.5"/></svg></span>Estimate your tax</h3>
      <ul class="mm-list">
        <li><a href="/uk/estimate/employed/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><path d="M2 13h20"/></svg></span><span class="mm-list-label">Employed (PAYE)</span></a></li>
        <li><a href="/uk/estimate/freelancer/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg></span><span class="mm-list-label">Freelancer / sole trader</span></a></li>
        <li><a href="/uk/estimate/landlord/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20z"/><path d="M9 21V13h6v8"/></svg></span><span class="mm-list-label">Landlord / buy-to-let</span></a></li>
        <li><a href="/uk/estimate/construction/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h20"/><path d="M4 18a8 8 0 0 1 16 0"/><path d="M10 6V3h4v3"/><path d="M12 6v5"/></svg></span><span class="mm-list-label">Construction (CIS)</span></a></li>
        <li><a href="/uk/estimate/hospitality/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a3 3 0 0 1 0 6h-2"/><path d="M7 4v2M11 4v2M15 4v2"/></svg></span><span class="mm-list-label">Hospitality</span></a></li>
        <li><a href="/uk/estimate/healthcare/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 13H7l2-4 3 8 2-5 2 1h4.5"/><path d="M21 11a8 8 0 0 0-16 0c0 5 8 11 8 11s8-6 8-11z"/></svg></span><span class="mm-list-label">Healthcare</span></a></li>
        <li><a href="/uk/estimate/retail/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8L7 3h10l2 5"/><path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M9 12a3 3 0 0 0 6 0"/></svg></span><span class="mm-list-label">Retail / e-commerce</span></a></li>
        <li><a href="/uk/estimate/creative/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 0 20c1 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.7 1.7-1.7H17a5 5 0 0 0 5-5c0-5-4.5-9.4-10-9.4z"/><circle cx="7" cy="11" r=".9"/><circle cx="9.5" cy="7" r=".9"/><circle cx="14.5" cy="7" r=".9"/><circle cx="17" cy="11" r=".9"/></svg></span><span class="mm-list-label">Creative</span></a></li>
        <li><a href="/uk/estimate/small-business/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9v11a1 1 0 0 0 1 1h6v-7h4v7h6a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/></svg></span><span class="mm-list-label">Small business</span></a></li>
      </ul>
    </div>` : cc === 'AU' || countryDir === 'au' ? `
    <div class="mm-col">
      <h3 class="mm-title"><span class="mm-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M14.5 8.5c-.5-1-1.5-1.5-2.7-1.5-1.7 0-3 1-3 3v3H8m1 0h5.5M9 16.5h5.5"/></svg></span>Estimate your tax</h3>
      <ul class="mm-list">
        <li><a href="/au/estimate/freelancer/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg></span><span class="mm-list-label">Freelancer / sole trader</span></a></li>
        <li><a href="/au/estimate/small-business/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9v11a1 1 0 0 0 1 1h6v-7h4v7h6a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/></svg></span><span class="mm-list-label">Small business</span></a></li>
      </ul>
    </div>` : '';

  const profileFooterHtml = cc === 'AU' ? `<footer class="tx-footer">
  <div class="tx-footer-inner">
    <div class="tx-footer-brand">
      <a class="tx-footer-brand-logo" href="/au/"><img src="/assets/taxready-world.svg" alt="TaxReady"></a>
      <p class="tx-footer-tagline">Australia&rsquo;s <em>only</em> AI-powered accountant directory. AI-matched local accountants from verified Australian firms.</p>
      <a class="tx-footer-partner" href="https://workiro.com" target="_blank" rel="noopener" aria-label="Workiro"><span class="tx-footer-partner-label">Powered by</span><img class="tx-footer-partner-logo" src="/assets/workiro-logo-light-bg.svg" alt="Workiro" loading="lazy"></a>
      <p class="tx-footer-partner-note">Built on the same secure platform that regulated professionals use to protect their clients&rsquo; data. <a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro &rarr;</a></p>
    </div>
    <div class="tx-footer-col"><h4>Estimate your tax</h4><ul>
      <li><a href="/au/estimate/freelancer/">Freelancer / sole trader</a></li>
      <li><a href="/au/estimate/small-business/">Small business</a></li>
    </ul></div>
    <div class="tx-footer-col"><h4>Find an accountant</h4><ul>
      <li><a href="/au/find-accountant/">Find my AI-matched accountant</a></li>
      <li><a href="/au/accounting-firms/">Browse all AU firms</a></li>
      <li><a href="/au/accounting-firms/sydney/">Sydney</a></li>
      <li><a href="/au/accounting-firms/melbourne/">Melbourne</a></li>
      <li><a href="/au/accounting-firms/brisbane/">Brisbane</a></li>
      <li><a href="/au/accounting-firms/perth/">Perth</a></li>
    </ul></div>
    <div class="tx-footer-col tx-footer-col--accent"><h4>For accountants</h4><ul>
      <li><a class="is-primary" href="/au/for-accountants/">Claim your free profile</a></li>
      <li><a href="/au/accounting-firms/">Find your existing listing</a></li>
      <li><a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro</a></li>
    </ul></div>
  </div>
  <div class="tx-footer-bar">
    <span>&copy; 2026 TaxReady &middot; Powered by <a href="https://www.workiro.com/" target="_blank" rel="noopener">Workiro</a></span>
    <span class="tx-footer-bar-legal"><a href="/about/">About</a><span>&middot;</span><a href="/how-firms-are-ranked/">How firms are ranked</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a></span>
  </div>
</footer>` : cc === 'US' ? `<footer class="tx-footer">
  <div class="tx-footer-inner">
    <div class="tx-footer-brand">
      <a class="tx-footer-brand-logo" href="/us/"><img src="/assets/taxready-world.svg" alt="TaxReady"></a>
      <p class="tx-footer-tagline">The US&rsquo;s <em>only</em> AI-powered accountant directory. AI-matched local CPAs and accountants from thousands of verified US firms.</p>
      <a class="tx-footer-partner" href="https://workiro.com" target="_blank" rel="noopener" aria-label="Workiro"><span class="tx-footer-partner-label">Powered by</span><img class="tx-footer-partner-logo" src="/assets/workiro-logo-light-bg.svg" alt="Workiro" loading="lazy"></a>
      <p class="tx-footer-partner-note">Built on the same secure platform that regulated professionals use to protect their clients&rsquo; data. <a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro &rarr;</a></p>
    </div>
    <div class="tx-footer-col"><h4>Find an accountant</h4><ul>
      <li><a href="/us/find-accountant/">Find my AI-matched accountant</a></li>
      <li><a href="/us/accounting-firms/">Browse all US firms</a></li>
      <li><a href="/us/accounting-firms/tx/">Texas</a></li>
      <li><a href="/us/accounting-firms/fl/">Florida</a></li>
      <li><a href="/us/accounting-firms/ca/">California</a></li>
      <li><a href="/us/accounting-firms/ny/">New York</a></li>
      <li><a href="/us/accounting-firms/nc/">North Carolina</a></li>
      <li><a href="/us/accounting-firms/az/">Arizona</a></li>
    </ul></div>
    <div class="tx-footer-col tx-footer-col--accent"><h4>For accountants &amp; CPAs</h4><ul>
      <li><a class="is-primary" href="/us/for-accountants/">Claim your free profile</a></li>
      <li><a href="/us/accounting-firms/">Find your existing listing</a></li>
      <li><a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro</a></li>
    </ul></div>
  </div>
  <div class="tx-footer-bar">
    <span>&copy; 2026 TaxReady &middot; Powered by <a href="https://www.workiro.com/" target="_blank" rel="noopener">Workiro</a></span>
    <span class="tx-footer-bar-legal"><a href="/about/">About</a><span>&middot;</span><a href="/how-firms-are-ranked/">How firms are ranked</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a></span>
  </div>
</footer>` : `<footer class="tx-footer">
  <div class="tx-footer-inner">
    <div class="tx-footer-brand">
      <a class="tx-footer-brand-logo" href="/uk/"><img src="/assets/taxready.svg" alt="TaxReady"></a>
      <p class="tx-footer-tagline">The UK&rsquo;s <em>only</em> AI-powered accountant directory. Free tax estimates &amp; AI-matched local accountants from ${totalCountStr} verified UK firms.</p>
      <a class="tx-footer-partner" href="https://workiro.com" target="_blank" rel="noopener" aria-label="Workiro"><span class="tx-footer-partner-label">Powered by</span><img class="tx-footer-partner-logo" src="/assets/workiro-logo-light-bg.svg" alt="Workiro" loading="lazy"></a>
      <p class="tx-footer-partner-note">Built on the same secure platform <strong>65,000+ UK accountants</strong> and other regulated professionals use to protect their clients&rsquo; data. <a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro &rarr;</a></p>
    </div>
    <div class="tx-footer-col"><h4>Estimate your tax</h4><ul>
      <li><a href="/uk/estimate/employed/">Employed (PAYE)</a></li>
      <li><a href="/uk/estimate/freelancer/">Freelancer / sole trader</a></li>
      <li><a href="/uk/estimate/landlord/">Landlord / buy-to-let</a></li>
      <li><a href="/uk/estimate/construction/">Construction (CIS)</a></li>
      <li><a href="/uk/estimate/hospitality/">Hospitality</a></li>
      <li><a href="/uk/estimate/healthcare/">Healthcare</a></li>
      <li><a href="/uk/estimate/retail/">Retail / e-commerce</a></li>
      <li><a href="/uk/estimate/creative/">Creative</a></li>
      <li><a href="/uk/estimate/small-business/">Small business</a></li>
    </ul></div>
    <div class="tx-footer-col"><h4>Find an accountant</h4><ul>
      <li><a href="/uk/find-accountant/">Find my AI-matched accountant</a></li>
      <li><a href="/uk/accounting-firms/">Browse all UK firms</a></li>
      <li><a href="/uk/accounting-firms/london/">London</a></li>
      <li><a href="/uk/accounting-firms/manchester/">Manchester</a></li>
      <li><a href="/uk/accounting-firms/birmingham/">Birmingham</a></li>
      <li><a href="/uk/accounting-firms/leeds/">Leeds</a></li>
      <li><a href="/uk/accounting-firms/bristol/">Bristol</a></li>
      <li><a href="/uk/accounting-firms/edinburgh/">Edinburgh</a></li>
    </ul></div>
    <div class="tx-footer-col tx-footer-col--accent"><h4>For accountants</h4><ul>
      <li><a class="is-primary" href="/uk/for-accountants/?firm_slug={{FIRM_SLUG}}&amp;city_slug={{FIRM_CITY_SLUG}}">Claim your free profile</a></li>
      <li><a href="/uk/accounting-firms/">Find your existing listing</a></li>
      <li><a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro</a></li>
    </ul></div>
  </div>
  <div class="tx-footer-bar">
    <span>&copy; 2026 TaxReady &middot; Powered by <a href="https://www.workiro.com/" target="_blank" rel="noopener">Workiro</a> &middot; Map &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a></span>
    <span class="tx-footer-bar-legal"><a href="/about/">About</a><span>&middot;</span><a href="/how-firms-are-ranked/">How firms are ranked</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a><span>&middot;</span><span class="tx-footer-disclaimer">Estimates only &mdash; not financial or tax advice.</span></span>
  </div>
</footer>`;

  const hasBadge = state === 1 || state === 3;
  const flags = {
    BIO:   hasText(firm.bio),
    TAGS:  hasText(segments) || hasText(firm.specialisms),
    CERTS: hasText(firm.accreditations) || !!firm.client_portal,
  };
  const similar = pickSimilarFirms(firm, opts.similar || []);

  const values = {
    FOOTER_HTML:          profileFooterHtml,
    MENU_CITY_LIST:       menuCityList,
    MENU_TAX_COL:         menuTaxCol,
    SIMILAR_FIRMS_HTML:   similarFirmsHtml(similar, displayCity, countryDir, displayCitySlug),
    TAG_CHIPS_HTML:       chipLinksHtml(splitTags(segments), 'chip-green') + chipLinksHtml(splitTags(firm.specialisms), 'chip-purple'),
    CERT_CHIPS_HTML:      (firm.client_portal ? chipLinksHtml(['Secure client portal'], 'chip-teal') : '') +
                          chipLinksHtml(splitTags(firm.accreditations), 'chip-teal'),
    DETAIL_CARDS_HTML:    detailCardsHtml(firm, segments, displayCity, state === 3 || state === 4),
    SCHEMA_JSON:          buildProfileSchema(firm, {
                            canonical, city: displayCity, countryDir, countryCode, countryLabel, segments, state, hasBadge,
                            description: seoDesc,
                            hubUrl: `https://taxready.me/${countryDir}/accounting-firms/${displayCitySlug}/`,
                          }),
    HTML_LANG:            cc === 'US' ? 'en-US' : cc === 'AU' ? 'en-AU' : 'en-GB',
    ROBOTS:               isProfileIndexable(firm) ? ROBOTS_INDEX : ROBOTS_NOINDEX,
    PAGE_STATE:           String(state),
    SEO_TITLE:            seoTitle,
    SEO_DESCRIPTION:      seoDesc,
    OG_IMAGE:             hasBadge ? (firm.badge_url || '').trim() : 'https://taxready.me/taxready_hero.png',
    HERO_VIDEO:           cc === 'US' ? '/assets/taxready-hero-us.mp4' : cc === 'AU' ? '/assets/taxready-hero-aus.mp4' : '/assets/taxready-hero.mp4',
    LOGO_SRC:             cc === 'GB' ? '/assets/taxready.svg' : '/assets/taxready-world.svg',
    FIRM_NAME:            (firm.name || '').trim(),
    FIRM_CITY:            displayCity,
    FIRM_CITY_SLUG:       displayCitySlug,
    FIRM_SLUG:            firmSlug,
    FIRM_ADDRESS_LINE:    (firm.address || '').trim() || displayCity,
    FIRM_POSTCODE:        (firm.postcode || '').trim(),
    FIRM_LAT:             String(firm.latitude  || ''),
    FIRM_LNG:             String(firm.longitude || ''),
    FIRM_COUNTRY_DIR:     countryDir,
    FIRM_COUNTRY_CODE:    countryCode,
    FIRM_COUNTRY_LABEL:   countryLabel,
    FIRM_BADGE_URL:       (firm.badge_url || '').trim(),
    FIRM_GOOGLE_RATING:   String(firm.rating  || ''),
    FIRM_GOOGLE_REVIEWS:  String(firm.reviews || ''),
    FIRM_SPECIALISMS:     (firm.specialisms || '').trim(),
    FIRM_SEGMENT:         segments,
    FIRM_EXTRA:           (firm.bio || '').trim(),
    REVIEWS_PHRASE:       reviews > 0 ? `${reviews}+ Google reviews` : 'Google reviews',
    PENDING_COUNT:        String(reviews),
    PENDING_NEED:         String(Math.max(0, 10 - reviews)),
    PENDING_PCT:          String(Math.min(100, reviews * 10)),
  };

  let html = stripPreviewBlock(template);
  html = stripBlocks(html, { state, country: countryCode, flags });
  return fillTokens(html, values);
}

// ─── City hub rendering ────────────────────────────────────────────────────

function parseFloat_(s) {
  const v = parseFloat(s);
  return isNaN(v) ? 0 : v;
}

function parseInt_(s) {
  const v = parseInt(s, 10);
  return isNaN(v) ? 0 : v;
}

function hybridScore(firm) {
  const r = parseFloat_(firm.rating);
  const n = parseInt_(firm.reviews);
  if (n <= 0 || r <= 0) return 0;
  let base = Math.log1p(n) * r;
  let boost = 0;
  const claimed = isClaimed(firm);
  if (claimed)                    boost += 0.15;
  if ((firm.specialisms || '').trim()) boost += 0.06;
  if ((firm.bio || '').trim())         boost += 0.04;
  if ((firm.accreditations || '').trim()) boost += 0.03;
  if ((firm.differentiators || '').trim()) boost += 0.02;
  return base * (1 + boost);
}

const TAG_SEP = /[;,|]+/;
const MAX_TAG_CHARS = 30;

function parseTags(raw, maxCount) {
  if (!raw) return [];
  const parts = raw.split(TAG_SEP).map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (let p of parts) {
    if (seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    if (p.length > MAX_TAG_CHARS) p = p.slice(0, MAX_TAG_CHARS - 1).trimEnd() + '…';
    out.push(p);
    if (out.length >= maxCount) break;
  }
  return out;
}

/**
 * One hub card. Indexable firms get a card that links to their profile;
 * the rest are listed without a profile link (they stay reachable through
 * search, the map and the matcher) plus a quiet claim link for the owner.
 */
function firmCardHtml(firm, rank, countryDir, indexable) {
  const name      = (firm.name || '').trim();
  const firmSlug  = (firm.firm_slug || '').trim() || slugify(name);
  const citySlug  = (firm.city_slug || '').trim() || slugify(firm.city || '');
  const rating    = parseFloat_(firm.rating);
  const reviews   = parseInt_(firm.reviews);
  const suburb    = (firm.suburb || '').trim();
  const city      = (firm.city   || '').trim();
  const displayCityInCard = city.toLowerCase() === 'other' ? '' : city;
  const loc       = [suburb, displayCityInCard].filter(Boolean).join(', ');
  const outward   = (firm.outward_code || '').trim();
  const locFull   = loc + (outward && !loc.includes(outward) ? ' · ' + outward : '');
  const segments  = deriveSegments(firm);
  const segTags   = parseTags(segments, 2);
  const specTags  = parseTags(firm.specialisms, 3);
  const tagHtml   = segTags.map(s => `<span class="cd-tag-seg">${esc(s)}</span>`).join('') +
                    specTags.map(s => `<span class="cd-tag-spec">${esc(s)}</span>`).join('');
  const linkCity  = (citySlug === 'other' && firm.suburb_slug) ? firm.suburb_slug : citySlug;
  const profileUrl = `/${countryDir}/accounting-firms/${linkCity}/${firmSlug}/`;
  const ratingTxt  = rating ? rating.toFixed(1) : '—';
  const reviewsTxt = reviews ? reviews.toLocaleString('en-GB') : '—';
  const rankCls    = rank <= 3 ? ' cd-rank-top' : '';
  const linked     = indexable && linkCity !== 'other';
  const delay      = `animation-delay:${(Math.min(rank - 1, 8) * 0.05 + 0.05).toFixed(2)}s`;
  const claimUrl   = `/${countryDir}/for-accountants/?firm_slug=${encodeURIComponent(firmSlug)}&amp;city_slug=${encodeURIComponent(linkCity)}`;

  return (linked
      ? `<a class="cd-card" href="${profileUrl}" style="${delay}">`
      : `<div class="cd-card cd-card--static" style="${delay}">`) +
    `<div class="cd-card-top">` +
    `<span class="cd-rank${rankCls}">#${rank}</span>` +
    (reviews > 0
      ? `<span class="cd-rating"><svg width="13" height="13" viewBox="0 0 24 24" fill="#F5A623" stroke="none" aria-hidden="true">` +
        `<path d="M12 2l2.4 7.4H22l-6.2 4.5L18 21l-6-4.4L6 21l2.2-7.1L2 9.4h7.6z"/></svg>` +
        `${ratingTxt}<span class="cd-rating-reviews">(${reviewsTxt})</span></span>`
      : '') +
    `</div>` +
    `<h3 class="cd-card-name">${esc(name)}</h3>` +
    (locFull ? `<div class="cd-card-loc"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>${esc(locFull)}</div>` : '') +
    (tagHtml ? `<div class="cd-tags">${tagHtml}</div>` : '') +
    (linked
      ? `<div class="cd-card-cta"><span class="cd-view">Learn more &rarr;</span></div></a>`
      : `<div class="cd-card-cta"><a class="cd-claim" href="${claimUrl}">Is this your firm? Claim it &rarr;</a></div></div>`);
}

function cityAboutHtml(cityName, firms, topSegs, avgRating, totalReviews, countryDir) {
  const firmCount = firms.length;
  const rated = firms.filter(f => parseInt_(f.reviews) > 0);
  const topByRev = [...rated].sort((a, b) => parseInt_(b.reviews) - parseInt_(a.reviews)).slice(0, 3);
  const parts = [];
  const citySlugForLink = slugify(cityName);

  let segsText = '';
  if (topSegs.length === 1)
    segsText = ` with specialisms concentrated in <strong>${esc(topSegs[0])}</strong>`;
  else if (topSegs.length === 2)
    segsText = ` with specialisms spanning <strong>${esc(topSegs[0])}</strong> and <strong>${esc(topSegs[1])}</strong>`;
  else if (topSegs.length >= 3)
    segsText = ` with specialisms spanning <strong>${esc(topSegs[0])}</strong>, <strong>${esc(topSegs[1])}</strong>, and <strong>${esc(topSegs[2])}</strong>`;

  parts.push(
    `<p>${esc(cityName)} has <strong>${plural(firmCount, 'accounting firm', 'accounting firms')}</strong> on the TaxReady directory${segsText}.` +
    (totalReviews > 0
      ? ` Listed ${firmCount === 1 ? 'firm holds' : 'firms hold'} an average Google rating of <strong>${avgRating.toFixed(1)}★</strong> over ` +
        `<strong>${plural(totalReviews, 'review', 'reviews')}</strong>.`
      : '') +
    `</p>`
  );

  // Specialisms firms here most often list (counted from firm data, 2+ firms each)
  const specCounts = new Map();
  for (const f of firms) {
    for (const t of new Set(splitTags(f.specialisms).map(x => x.slice(0, MAX_TAG_CHARS)))) {
      const k = t.toLowerCase();
      const cur = specCounts.get(k) || { label: t, n: 0 };
      cur.n += 1;
      specCounts.set(k, cur);
    }
  }
  const topSpecs = [...specCounts.values()].filter(c => c.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6);
  if (topSpecs.length) {
    parts.push(
      `<p>Specialisms most often listed by ${esc(cityName)} firms: ` +
      topSpecs.map(c => `<strong>${esc(c.label)}</strong> (${plural(c.n, 'firm', 'firms')})`).join(', ') + `.</p>`
    );
  }

  if (topByRev.length > 1) {
    const names = topByRev.map(f => `<strong>${esc((f.name || '').trim())}</strong>`);
    const namesText = names.length === 2 ? names.join(' and ')
      : names.slice(0, -1).join(', ') + `, and ${names[names.length - 1]}`;
    parts.push(
      `<p>The most-reviewed firms in ${esc(cityName)} are ${namesText}.</p>`
    );
  }

  parts.push(
    `<p>Not sure who to pick? Our AI reviews ${firmCount === 1 ? 'the listed firm' : `all ${firmCount} firms`} against your situation and returns your best matches in 60 seconds. ` +
    `<a href="/${countryDir}/find-accountant/?city=${citySlugForLink}" style="color:var(--teal);text-decoration:none;border-bottom:1px dotted rgba(0,177,178,.4);">` +
    `Get AI-matched for ${esc(cityName)} &rarr;</a></p>`
  );

  return parts.join('\n    ');
}

function nearbyChipsHtml(currentSlug, nearbyCities, countryDir) {
  const dir      = countryDir || 'uk';
  const label    = dir === 'us' ? 'US' : dir === 'au' ? 'AU' : 'UK';
  const allLabel = `All ${label} cities &rarr;`;
  if (!nearbyCities.length) {
    return `<a class="cd-nearby-chip" href="/${dir}/accounting-firms/">${allLabel}</a>`;
  }
  const parts = nearbyCities.map(({ citySlug, cityName, count }) =>
    `<a class="cd-nearby-chip" href="/${dir}/accounting-firms/${citySlug}/">` +
    `${esc(cityName)}<span class="cd-nearby-count">${count}</span></a>`
  );
  parts.push(
    `<a class="cd-nearby-chip" href="/${dir}/accounting-firms/" style="border-color:var(--teal);color:var(--teal);font-weight:600;">${allLabel}</a>`
  );
  return parts.join('\n    ');
}

function buildCitySchema(cityName, citySlug, countryDir, firmsRanked, firmCount, avgRating, totalReviews, indexable) {
  const canonical = `https://taxready.me/${countryDir}/accounting-firms/${citySlug}/`;
  const today = new Date().toISOString().slice(0, 10);

  const itemListElements = firmsRanked.slice(0, 50).map((f, i) => {
    const name = (f.name || '').trim();
    const fSlug = (f.firm_slug || '').trim() || slugify(name);
    const fCity = (f.city_slug === 'other' && f.suburb_slug) ? f.suburb_slug : citySlug;
    const item = {
      '@type': 'AccountingService',
      name,
      // Only indexable profiles get a URL — the rest are noindex pages.
      ...(indexable(f) && fCity !== 'other' ? { url: `https://taxready.me/${countryDir}/accounting-firms/${fCity}/${fSlug}/` } : {}),
      address: {
        '@type': 'PostalAddress',
        streetAddress: (f.address || '').trim(),
        postalCode: (f.postcode || '').trim(),
        addressLocality: cityName,
        addressCountry: countryDir === 'au' ? 'AU' : countryDir === 'us' ? 'US' : 'GB',
      },
    };
    if (f.latitude && f.longitude) {
      item.geo = { '@type': 'GeoCoordinates', latitude: f.latitude, longitude: f.longitude };
    }
    if ((f.website || '').startsWith('http')) item.sameAs = f.website;
    return { '@type': 'ListItem', position: i + 1, item };
  });

  const graph = [
    {
      '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `https://taxready.me/${countryDir}/` },
        { '@type': 'ListItem', position: 2, name: `${countryDir.toUpperCase()} accounting firms`, item: `https://taxready.me/${countryDir}/accounting-firms/` },
        { '@type': 'ListItem', position: 3, name: cityName, item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage', '@id': canonical + '#page', url: canonical,
      name: `${hubTier(firmCount) === 'best' ? 'Best accountants' : 'Accountants'} in ${cityName}`,
      description: `Compare ${plural(firmCount, 'local accounting firm', 'local accounting firms')} in ${cityName}.` +
                   (totalReviews > 0 ? ` Ranked by Google reviews · average rating ${avgRating.toFixed(1)}★.` : ''),
      datePublished: '2026-04-01', dateModified: today,
      inLanguage: countryDir === 'us' ? 'en-US' : countryDir === 'au' ? 'en-AU' : 'en-GB',
      isPartOf: { '@type': 'WebSite', name: 'TaxReady', url: 'https://taxready.me/' },
      breadcrumb: { '@id': canonical + '#breadcrumb' },
      mainEntity: { '@id': canonical + '#list' },
    },
    {
      '@type': 'ItemList', '@id': canonical + '#list',
      name: `Accounting firms in ${cityName}`, numberOfItems: firmCount,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: itemListElements,
    },
  ];

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');
}

function topSegmentsForCity(firms, topN = 3) {
  const counts = {};
  for (const f of firms) {
    const segs = deriveSegments(f);
    if (!segs) continue;
    for (const seg of segs.split(TAG_SEP).map(s => s.trim()).filter(Boolean)) {
      counts[seg] = (counts[seg] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([s]) => s);
}

// ─── US State directory ────────────────────────────────────────────────────

export const STATE_CODES = new Set([
  'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia',
  'ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj',
  'nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt',
  'va','wa','wv','wi','wy','dc',
]);

export const STATE_NAME = {
  al:'Alabama', ak:'Alaska', az:'Arizona', ar:'Arkansas', ca:'California',
  co:'Colorado', ct:'Connecticut', de:'Delaware', fl:'Florida', ga:'Georgia',
  hi:'Hawaii', id:'Idaho', il:'Illinois', in:'Indiana', ia:'Iowa',
  ks:'Kansas', ky:'Kentucky', la:'Louisiana', me:'Maine', md:'Maryland',
  ma:'Massachusetts', mi:'Michigan', mn:'Minnesota', ms:'Mississippi', mo:'Missouri',
  mt:'Montana', ne:'Nebraska', nv:'Nevada', nh:'New Hampshire', nj:'New Jersey',
  nm:'New Mexico', ny:'New York', nc:'North Carolina', nd:'North Dakota', oh:'Ohio',
  ok:'Oklahoma', or:'Oregon', pa:'Pennsylvania', ri:'Rhode Island', sc:'South Carolina',
  sd:'South Dakota', tn:'Tennessee', tx:'Texas', ut:'Utah', vt:'Vermont',
  va:'Virginia', wa:'Washington', wv:'West Virginia', wi:'Wisconsin', wy:'Wyoming',
  dc:'Washington D.C.',
};

function buildStateIndexSchema(states, totalFirms) {
  const canonical = 'https://taxready.me/us/accounting-firms/';
  const today = new Date().toISOString().slice(0, 10);
  const itemListElements = states.map((s, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: {
      '@type': 'Place', name: s.stateName,
      url: `https://taxready.me/us/accounting-firms/${s.stateCode}/`,
      address: { '@type': 'PostalAddress', addressRegion: s.stateCode.toUpperCase(), addressCountry: 'US' },
    },
  }));
  const graph = [
    {
      '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://taxready.me/us/' },
        { '@type': 'ListItem', position: 2, name: 'US accounting firms', item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage', '@id': canonical + '#page', url: canonical,
      name: 'US Accounting Firms Directory',
      description: `Browse ${totalFirms.toLocaleString('en-US')} verified US accounting firms across ${states.length} states.`,
      datePublished: '2026-06-01', dateModified: today, inLanguage: 'en-US',
      isPartOf: { '@type': 'WebSite', name: 'TaxReady', url: 'https://taxready.me/' },
      breadcrumb: { '@id': canonical + '#breadcrumb' },
      mainEntity: { '@id': canonical + '#list' },
    },
    {
      '@type': 'ItemList', '@id': canonical + '#list',
      name: 'US states with accounting firms listed',
      numberOfItems: states.length,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: itemListElements,
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');
}

function buildStateHubSchema(stateName, stateCode, cities, firmCount, avgRating) {
  const canonical = `https://taxready.me/us/accounting-firms/${stateCode}/`;
  const today = new Date().toISOString().slice(0, 10);
  const itemListElements = cities.map((c, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: {
      '@type': 'Place', name: c.cityName,
      url: `https://taxready.me/us/accounting-firms/${c.citySlug}/`,
      address: { '@type': 'PostalAddress', addressLocality: c.cityName, addressRegion: stateCode.toUpperCase(), addressCountry: 'US' },
    },
  }));
  const graph = [
    {
      '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://taxready.me/us/' },
        { '@type': 'ListItem', position: 2, name: 'US accounting firms', item: 'https://taxready.me/us/accounting-firms/' },
        { '@type': 'ListItem', position: 3, name: stateName, item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage', '@id': canonical + '#page', url: canonical,
      name: `Accounting Firms in ${stateName}`,
      description: `Browse ${plural(firmCount, 'verified accounting firm', 'verified accounting firms')} across ${plural(cities.length, 'city', 'cities')} in ${stateName}. Average rating ${avgRating.toFixed(1)}★.`,
      datePublished: '2026-06-01', dateModified: today, inLanguage: 'en-US',
      isPartOf: { '@type': 'WebSite', name: 'TaxReady', url: 'https://taxready.me/' },
      breadcrumb: { '@id': canonical + '#breadcrumb' },
      mainEntity: { '@id': canonical + '#list' },
    },
    {
      '@type': 'ItemList', '@id': canonical + '#list',
      name: `Cities in ${stateName} with accounting firms`,
      numberOfItems: cities.length,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: itemListElements,
    },
  ];
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');
}

export function buildStateIndexPage(template, states) {
  const totalFirms  = states.reduce((s, st) => s + st.firmCount, 0);
  // DC is a federal district, not a state — show "50 states" in copy but keep DC tile in the list
  const stateCount  = states.filter(s => s.stateCode !== 'dc').length;
  const ratedStates = states.filter(s => s.avgRating > 0);
  const avgRating   = ratedStates.length
    ? ratedStates.reduce((s, st) => s + st.avgRating, 0) / ratedStates.length : 0;
  const canonical   = 'https://taxready.me/us/accounting-firms/';
  const seoTitle    = `US Accounting Firms Directory | ${totalFirms.toLocaleString('en-US')} Verified Firms | TaxReady`;
  const seoDesc     = `Browse ${totalFirms.toLocaleString('en-US')} verified US accounting firms across ${stateCount} states. AI-matched recommendations in 60 seconds.`;

  const tileHtml = states.map(s =>
    `<a class="dr-tile" href="/us/accounting-firms/${s.stateCode}/" data-city-name="${esc(s.stateName)}">` +
    `<h3 class="dr-tile-name">${esc(s.stateName)}</h3>` +
    `<div class="dr-tile-meta">${plural(s.firmCount, 'firm', 'firms')}` +
    (s.avgRating > 0 ? ` &middot; <span class="dr-tile-rating">${s.avgRating.toFixed(1)}&#9733;</span>` : '') +
    `</div></a>`
  ).join('\n    ');

  const replacements = {
    '{{TOTAL_FIRMS}}':     totalFirms.toLocaleString('en-US'),
    '{{STATE_COUNT}}':     String(stateCount),
    '{{AVG_RATING}}':      avgRating.toFixed(1),
    '{{TILE_HTML}}':       tileHtml,
    '{{SCHEMA_JSON}}':     buildStateIndexSchema(states, totalFirms),
    '{{CANONICAL_URL}}':   canonical,
    '{{SEO_TITLE}}':       seoTitle,
    '{{SEO_DESCRIPTION}}': seoDesc,
  };

  let html = template;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }
  return html;
}

export function buildStateHubPage(template, stateCode, cities) {
  const stateName   = STATE_NAME[stateCode] || stateCode.toUpperCase();
  const firmCount   = cities.reduce((s, c) => s + c.firmCount, 0);
  const cityCount   = cities.length;
  const ratedCities = cities.filter(c => c.avgRating > 0);
  const avgRating   = ratedCities.length
    ? ratedCities.reduce((s, c) => s + c.avgRating, 0) / ratedCities.length : 0;
  const canonical   = `https://taxready.me/us/accounting-firms/${stateCode}/`;
  const seoTitle    = hubSeoTitle(stateName, firmCount);
  let   seoDesc     = `Browse ${plural(firmCount, 'verified accounting firm', 'verified accounting firms')} across ${plural(cityCount, 'city', 'cities')} in ${stateName}. AI-matched in 60 seconds.`;
  if (seoDesc.length > 160) seoDesc = seoDesc.slice(0, 157).trimEnd() + '...';

  const tileHtml = cities.map(c =>
    `<a class="dr-tile" href="/us/accounting-firms/${c.citySlug}/" data-city-name="${esc(c.cityName)}">` +
    `<h3 class="dr-tile-name">${esc(c.cityName)}</h3>` +
    `<div class="dr-tile-meta">${plural(c.firmCount, 'firm', 'firms')}` +
    (c.avgRating > 0 ? ` &middot; <span class="dr-tile-rating">${c.avgRating.toFixed(1)}&#9733;</span>` : '') +
    `</div></a>`
  ).join('\n    ');

  const replacements = {
    '{{STATE_NAME}}':      stateName,
    '{{STATE_CODE}}':      stateCode,
    '{{FIRM_COUNT}}':      firmCount.toLocaleString('en-US'),
    '{{CITY_COUNT}}':      String(cityCount),
    '{{AVG_RATING}}':      avgRating.toFixed(1),
    '{{TILE_HTML}}':       tileHtml,
    '{{SCHEMA_JSON}}':     buildStateHubSchema(stateName, stateCode, cities, firmCount, avgRating),
    '{{CANONICAL_URL}}':   canonical,
    '{{SEO_TITLE}}':       seoTitle,
    '{{SEO_DESCRIPTION}}': seoDesc,
  };

  let html = template;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }
  return html;
}

/**
 * Build a city hub page.
 * @param {string} template - city-template.html content
 * @param {string} countryDir - 'uk' | 'au'
 * @param {string} citySlug - URL slug
 * @param {object[]} firms - D1 rows for this city
 * @param {object[]} nearbyCities - [{citySlug, cityName, count}] sorted nearest-first
 */
export function buildCityPage(template, countryDir, citySlug, firms, nearbyCities, totalCount = 4000) {
  const firmsRanked = [...firms].sort((a, b) => hybridScore(b) - hybridScore(a));

  const cityName = (() => {
    const counts = {};
    for (const f of firmsRanked) {
      const c = (f.city   || '').trim();
      const s = (f.suburb || '').trim();
      const label = (citySlug !== 'other' && c.toLowerCase() === 'other' && s) ? s : c;
      if (label) counts[label] = (counts[label] || 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : citySlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  })();

  const totalCountStr = totalCount >= 1000
    ? Math.floor(totalCount / 1000) + ',000+'
    : String(totalCount) + '+';

  const firmCount   = firmsRanked.length;
  const rated       = firmsRanked.filter(f => parseInt_(f.reviews) > 0);
  const totalReviews = rated.reduce((s, f) => s + parseInt_(f.reviews), 0);
  const avgRating   = rated.length
    ? rated.reduce((s, f) => s + parseFloat_(f.rating), 0) / rated.length
    : 0;
  const topSegs     = topSegmentsForCity(firmsRanked);
  const canonical   = `https://taxready.me/${countryDir}/accounting-firms/${citySlug}/`;
  const tier        = hubTier(firmCount);
  const seoTitle    = hubSeoTitle(cityName, firmCount);
  let seoDesc       = `Compare ${plural(firmCount, 'local accounting firm', 'local accounting firms')} in ${cityName}.` +
                      (totalReviews > 0 ? ` Ranked by Google reviews · avg ${avgRating.toFixed(1)}★ over ${plural(totalReviews, 'review', 'reviews')}.` : '') +
                      ` AI-matched recommendations in 60 seconds.`;
  if (seoDesc.length > 160) seoDesc = seoDesc.slice(0, 157).trimEnd() + '...';

  const hreflang      = countryDir === 'au' ? 'en-au' : countryDir === 'us' ? 'en-us' : 'en-gb';
  const firmListHtml  = firmsRanked.map((f, i) => firmCardHtml(f, i + 1, countryDir, isProfileIndexable(f))).join('\n    ');
  const cityAbout     = cityAboutHtml(cityName, firmsRanked, topSegs, avgRating, totalReviews, countryDir);
  const nearbyHtml    = nearbyChipsHtml(citySlug, nearbyCities, countryDir);
  const schemaJson    = buildCitySchema(cityName, citySlug, countryDir, firmsRanked, firmCount, avgRating, totalReviews, isProfileIndexable);
  const h1Html        = tier === 'best'
    ? `The <em>best accounting firms</em> <span class="cd-h1-loc">in ${esc(cityName)}</span>`
    : `<em>Accounting ${firmCount === 1 ? 'firm' : 'firms'}</em> <span class="cd-h1-loc">in ${esc(cityName)}</span>`;

  const heroVideo = countryDir === 'us' ? '/assets/taxready-hero-us.mp4'
                  : countryDir === 'au' ? '/assets/taxready-hero-aus.mp4'
                  : '/assets/taxready-hero.mp4';

  const countryLabelFull = countryDir === 'us' ? 'US' : countryDir === 'au' ? 'AU' : 'UK';

  const menuCityList = countryDir === 'uk' ? `
        <li class="mm-sub-title">Popular cities</li>
        <li><a href="/uk/accounting-firms/london/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">London</span></a></li>
        <li><a href="/uk/accounting-firms/manchester/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Manchester</span></a></li>
        <li><a href="/uk/accounting-firms/birmingham/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Birmingham</span></a></li>
        <li><a href="/uk/accounting-firms/leeds/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Leeds</span></a></li>
        <li><a href="/uk/accounting-firms/bristol/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Bristol</span></a></li>
        <li><a href="/uk/accounting-firms/glasgow/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Glasgow</span></a></li>
        <li><a href="/uk/accounting-firms/edinburgh/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Edinburgh</span></a></li>
        <li><a href="/uk/accounting-firms/liverpool/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/></svg></span><span class="mm-list-label">Liverpool</span></a></li>` : '';

  const menuTaxCol = countryDir === 'uk' ? `
    <div class="mm-col">
      <h3 class="mm-title"><span class="mm-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M14.5 8.5c-.5-1-1.5-1.5-2.7-1.5-1.7 0-3 1-3 3v3H8m1 0h5.5M9 16.5h5.5"/></svg></span>Estimate your tax</h3>
      <ul class="mm-list">
        <li><a href="/uk/estimate/employed/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><path d="M2 13h20"/></svg></span><span class="mm-list-label">Employed (PAYE)</span></a></li>
        <li><a href="/uk/estimate/freelancer/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg></span><span class="mm-list-label">Freelancer / sole trader</span></a></li>
        <li><a href="/uk/estimate/landlord/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20z"/><path d="M9 21V13h6v8"/></svg></span><span class="mm-list-label">Landlord / buy-to-let</span></a></li>
        <li><a href="/uk/estimate/construction/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18h20"/><path d="M4 18a8 8 0 0 1 16 0"/><path d="M10 6V3h4v3"/><path d="M12 6v5"/></svg></span><span class="mm-list-label">Construction (CIS)</span></a></li>
        <li><a href="/uk/estimate/hospitality/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a3 3 0 0 1 0 6h-2"/><path d="M7 4v2M11 4v2M15 4v2"/></svg></span><span class="mm-list-label">Hospitality</span></a></li>
        <li><a href="/uk/estimate/healthcare/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 13H7l2-4 3 8 2-5 2 1h4.5"/><path d="M21 11a8 8 0 0 0-16 0c0 5 8 11 8 11s8-6 8-11z"/></svg></span><span class="mm-list-label">Healthcare</span></a></li>
        <li><a href="/uk/estimate/retail/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8L7 3h10l2 5"/><path d="M5 8h14v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M9 12a3 3 0 0 0 6 0"/></svg></span><span class="mm-list-label">Retail / e-commerce</span></a></li>
        <li><a href="/uk/estimate/creative/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 0 20c1 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.7 1.7-1.7H17a5 5 0 0 0 5-5c0-5-4.5-9.4-10-9.4z"/><circle cx="7" cy="11" r=".9"/><circle cx="9.5" cy="7" r=".9"/><circle cx="14.5" cy="7" r=".9"/><circle cx="17" cy="11" r=".9"/></svg></span><span class="mm-list-label">Creative</span></a></li>
        <li><a href="/uk/estimate/small-business/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9v11a1 1 0 0 0 1 1h6v-7h4v7h6a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/></svg></span><span class="mm-list-label">Small business</span></a></li>
      </ul>
    </div>` : countryDir === 'au' ? `
    <div class="mm-col">
      <h3 class="mm-title"><span class="mm-title-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M14.5 8.5c-.5-1-1.5-1.5-2.7-1.5-1.7 0-3 1-3 3v3H8m1 0h5.5M9 16.5h5.5"/></svg></span>Estimate your tax</h3>
      <ul class="mm-list">
        <li><a href="/au/estimate/freelancer/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/></svg></span><span class="mm-list-label">Freelancer / sole trader</span></a></li>
        <li><a href="/au/estimate/small-business/"><span class="mm-list-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9v11a1 1 0 0 0 1 1h6v-7h4v7h6a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/></svg></span><span class="mm-list-label">Small business</span></a></li>
      </ul>
    </div>` : '';

  const footerHtml = countryDir === 'us' ? `<footer class="tx-footer">
  <div class="tx-footer-inner">
    <div class="tx-footer-brand">
      <a class="tx-footer-brand-logo" href="/us/"><img src="/assets/taxready-world.svg" alt="TaxReady"></a>
      <p class="tx-footer-tagline">The US&rsquo;s <em>only</em> AI-powered accountant directory. AI-matched local CPAs and accountants from thousands of verified US firms.</p>
      <a class="tx-footer-partner" href="https://workiro.com" target="_blank" rel="noopener" aria-label="Workiro"><span class="tx-footer-partner-label">Powered by</span><img class="tx-footer-partner-logo" src="/assets/workiro-logo-light-bg.svg" alt="Workiro" loading="lazy"></a>
      <p class="tx-footer-partner-note">Built on the same secure platform that regulated professionals use to protect their clients&rsquo; data. <a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro &rarr;</a></p>
    </div>
    <div class="tx-footer-col"><h4>Find an accountant</h4><ul>
      <li><a href="/us/find-accountant/">Find my AI-matched accountant</a></li>
      <li><a href="/us/accounting-firms/">Browse all US firms</a></li>
      <li><a href="/us/accounting-firms/tx/">Texas</a></li>
      <li><a href="/us/accounting-firms/fl/">Florida</a></li>
      <li><a href="/us/accounting-firms/ca/">California</a></li>
      <li><a href="/us/accounting-firms/ny/">New York</a></li>
      <li><a href="/us/accounting-firms/nc/">North Carolina</a></li>
      <li><a href="/us/accounting-firms/az/">Arizona</a></li>
    </ul></div>
    <div class="tx-footer-col tx-footer-col--accent"><h4>For accountants &amp; CPAs</h4><ul>
      <li><a class="is-primary" href="/us/for-accountants/">Claim your free profile</a></li>
      <li><a href="/us/accounting-firms/">Find your existing listing</a></li>
      <li><a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro</a></li>
    </ul></div>
  </div>
  <div class="tx-footer-bar">
    <span>&copy; 2026 TaxReady &middot; Powered by <a href="https://www.workiro.com/" target="_blank" rel="noopener">Workiro</a></span>
    <span class="tx-footer-bar-legal"><a href="/about/">About</a><span>&middot;</span><a href="/how-firms-are-ranked/">How firms are ranked</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a></span>
  </div>
</footer>` : `<footer class="tx-footer">
  <div class="tx-footer-inner">
    <div class="tx-footer-brand">
      <a class="tx-footer-brand-logo" href="/uk/"><img src="/assets/taxready.svg" alt="TaxReady"></a>
      <p class="tx-footer-tagline">The UK&rsquo;s <em>only</em> AI-powered accountant directory. Free tax estimates &amp; AI-matched local accountants from ${totalCountStr} verified UK firms.</p>
      <a class="tx-footer-partner" href="https://workiro.com" target="_blank" rel="noopener" aria-label="Workiro"><span class="tx-footer-partner-label">Powered by</span><img class="tx-footer-partner-logo" src="/assets/workiro-logo-light-bg.svg" alt="Workiro" loading="lazy"></a>
      <p class="tx-footer-partner-note">Built on the same secure platform <strong>65,000+ UK accountants</strong> and other regulated professionals use to protect their clients&rsquo; data. <a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro &rarr;</a></p>
    </div>
    <div class="tx-footer-col"><h4>Estimate your tax</h4><ul>
      <li><a href="/uk/estimate/employed/">Employed (PAYE)</a></li>
      <li><a href="/uk/estimate/freelancer/">Freelancer / sole trader</a></li>
      <li><a href="/uk/estimate/landlord/">Landlord / buy-to-let</a></li>
      <li><a href="/uk/estimate/construction/">Construction (CIS)</a></li>
      <li><a href="/uk/estimate/hospitality/">Hospitality</a></li>
      <li><a href="/uk/estimate/healthcare/">Healthcare</a></li>
      <li><a href="/uk/estimate/retail/">Retail / e-commerce</a></li>
      <li><a href="/uk/estimate/creative/">Creative</a></li>
      <li><a href="/uk/estimate/small-business/">Small business</a></li>
    </ul></div>
    <div class="tx-footer-col"><h4>Find an accountant</h4><ul>
      <li><a href="/uk/find-accountant/">Find my AI-matched accountant</a></li>
      <li><a href="/uk/accounting-firms/">Browse all UK firms</a></li>
      <li><a href="/uk/accounting-firms/london/">London</a></li>
      <li><a href="/uk/accounting-firms/manchester/">Manchester</a></li>
      <li><a href="/uk/accounting-firms/birmingham/">Birmingham</a></li>
      <li><a href="/uk/accounting-firms/leeds/">Leeds</a></li>
      <li><a href="/uk/accounting-firms/bristol/">Bristol</a></li>
      <li><a href="/uk/accounting-firms/edinburgh/">Edinburgh</a></li>
    </ul></div>
    <div class="tx-footer-col tx-footer-col--accent"><h4>For accountants</h4><ul>
      <li><a class="is-primary" href="/uk/for-accountants/">Claim your free profile</a></li>
      <li><a href="/uk/accounting-firms/">Find your existing listing</a></li>
      <li><a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro</a></li>
    </ul></div>
  </div>
  <div class="tx-footer-bar">
    <span>&copy; 2026 TaxReady &middot; Powered by <a href="https://www.workiro.com/" target="_blank" rel="noopener">Workiro</a> &middot; Map &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a></span>
    <span class="tx-footer-bar-legal"><a href="/about/">About</a><span>&middot;</span><a href="/how-firms-are-ranked/">How firms are ranked</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a><span>&middot;</span><span class="tx-footer-disclaimer">Estimates only &mdash; not financial or tax advice.</span></span>
  </div>
</footer>`;

  const replacements = {
    // Raw-HTML tokens first: H1_HTML is pre-escaped and must not be re-processed.
    '{{H1_HTML}}':            h1Html,
    '{{CITY_NAME}}':          esc(cityName),
    '{{CITY_SLUG}}':          citySlug,
    '{{FIRM_COUNT}}':         firmCount.toLocaleString('en-GB'),
    '{{FIRM_COUNT_LABEL}}':   plural(firmCount, 'accounting firm', 'accounting firms'),
    '{{FIRM_NOUN}}':          firmCount === 1 ? 'firm' : 'firms',
    '{{ROBOTS}}':             tier === 'noindex' ? ROBOTS_NOINDEX : ROBOTS_INDEX,
    '{{AVG_RATING}}':         avgRating.toFixed(2),
    '{{TOTAL_REVIEWS}}':      totalReviews.toLocaleString('en-GB'),
    '{{SEO_TITLE}}':          esc(seoTitle),
    '{{SEO_DESCRIPTION}}':    esc(seoDesc),
    '{{CANONICAL_URL}}':      canonical,
    '{{HREFLANG}}':           hreflang,
    '{{FIRM_LIST_HTML}}':     firmListHtml,
    '{{CITY_ABOUT_HTML}}':    cityAbout,
    '{{NEARBY_CITIES_HTML}}': nearbyHtml,
    '{{SCHEMA_JSON}}':        schemaJson,
    '{{COUNTRY_DIR}}':        countryDir,
    '{{COUNTRY_LABEL}}':      countryLabelFull,
    '{{HERO_VIDEO}}':         heroVideo,
    '{{MENU_CITY_LIST}}':     menuCityList,
    '{{MENU_TAX_COL}}':       menuTaxCol,
    '{{FOOTER_HTML}}':        footerHtml,
    '{{LOGO_SRC}}':           countryDir === 'uk' ? '/assets/taxready.svg' : '/assets/taxready-world.svg',
  };

  let html = template;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }
  return html;
}
