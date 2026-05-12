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

function computeSEO(firm, segments) {
  const name      = (firm.name || '').trim();
  const city      = (firm.city || '').trim();
  const rating    = parseFloat(firm.rating) || 0;
  const reviews   = parseInt(firm.reviews) || 0;
  const hasBadge  = isTruthy(firm.badge_url);
  const isClaimed = firm.is_claimed === 1 || firm.is_claimed === true ||
                    String(firm.is_claimed || '').toUpperCase() === 'TRUE';

  let qualifier;
  if (hasBadge)                           qualifier = 'Top-rated';
  else if (isClaimed)                     qualifier = 'Verified';
  else if (reviews >= 10 && rating >= 4.5) qualifier = 'Highly-rated';
  else if (reviews >= 10 && rating >= 4.0) qualifier = 'Well-reviewed';
  else                                     qualifier = '';

  const prefix = qualifier ? `${qualifier} Accountant` : 'Accountant';
  const speciList = (segments || firm.specialisms || '').split(/[,;|]+/).map(s => s.trim()).filter(Boolean);
  const speciSnip = speciList[0] ? ` specialising in ${speciList[0]}` : '';

  const seoTitle = `${name} | ${prefix} in ${city} | TaxReady`;
  const seoDesc  = `${name} is ${qualifier ? 'a ' + qualifier.toLowerCase() + ' ' : 'an '}` +
                   `accounting firm in ${city}${speciSnip}. View full profile and get in touch via TaxReady.`;
  const seoDescTrimmed = seoDesc.length > 160 ? seoDesc.slice(0, 157) + '...' : seoDesc;

  return {
    seoTitle,
    seoDesc: seoDescTrimmed,
    seoSchemaDesc: seoDescTrimmed,
  };
}

function esc(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsStr(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
}

/**
 * Remove the designer TXPREVIEW toolbar from the template.
 * The section starts with a long comment line and ends at the </script>
 * that closes the txSetState function, just before the Leaflet/nav scripts.
 */
export function stripPreviewBlock(html) {
  return html.replace(
    /<!--\s*={50,}[\s\S]*?function txSetState[\s\S]*?<\/script>/,
    ''
  );
}

/**
 * Clean up JSON-LD schema: remove invalid fields when their data is absent.
 * Must run AFTER token replacement so we can check real values.
 */
function cleanSchema(html, firm) {
  const rating  = parseFloat(firm.rating) || 0;
  const reviews = parseInt(firm.reviews) || 0;
  const hasBadge = isTruthy(firm.badge_url);
  const isClaimed = firm.is_claimed === 1 || firm.is_claimed === true ||
                    String(firm.is_claimed || '').toUpperCase() === 'TRUE';
  const isState5  = !isClaimed && reviews < 10;

  // 1. No badge → remove "image" line from LocalBusiness schema
  if (!hasBadge) {
    html = html.replace(/\s*"image":\s*"[^"]*",?\s*\n/g, '\n');
  }

  // 2. No rating/reviews → remove entire aggregateRating block
  if (reviews < 10 || rating <= 0) {
    html = html.replace(
      /\s*"aggregateRating":\s*\{[^}]*\},?\s*\n/g,
      '\n'
    );
  }

  // 3. No specialisms → remove knowsAbout
  if (!isTruthy(firm.specialisms) && !isTruthy(firm.specialist_segments)) {
    html = html.replace(/\s*"knowsAbout":\s*"[^"]*",?\s*\n/g, '\n');
  }

  // 4. Set sameAs from website (the template has sameAs: [])
  if (isTruthy(firm.website)) {
    html = html.replace('"sameAs": []', `"sameAs": ["${(firm.website || '').trim()}"]`);
  }

  // 5. State 5 (< 10 reviews, unclaimed) → strip FAQ schema block entirely
  if (isState5) {
    html = html.replace(/<!-- FAQ-SCHEMA-START[\s\S]*?<!-- FAQ-SCHEMA-END -->/g, '');
    // Remove fee FAQ question if no fees
    // (already removed above with the entire block for state5)
  } else if (!isTruthy(firm.fees)) {
    // Remove just the fee FAQ question (leave other FAQ items)
    html = html.replace(
      /\s*\{\s*"@type":\s*"Question",\s*"name":\s*"How much does[^}]*"acceptedAnswer":\s*\{[^}]*\}\s*\},?/g,
      ''
    );
  }

  return html;
}

/**
 * Build a complete firm profile page from the template and D1 row.
 *
 * @param {string} template  - Raw accountant-profile-template.html content
 * @param {object} firm      - D1 row for the firm
 * @param {number} totalCount - Total firm count for TOTAL_FIRM_COUNT token
 * @returns {string} Complete HTML ready to serve
 */
export function buildFirmProfile(template, firm, totalCount = 4000) {
  const countryDir   = (firm.country || 'GB').toUpperCase() === 'AU' ? 'au' : 'uk';
  const countryCode  = (firm.country || 'GB').toUpperCase() === 'AU' ? 'AU' : 'GB';
  const countryLabel = countryCode === 'AU' ? 'Australian' : 'UK';

  const citySlug = (firm.city_slug || '').trim() || slugify(firm.city || '');
  const firmSlug = (firm.firm_slug || '').trim() || slugify(firm.name || '');
  const segments = deriveSegments(firm);
  const { seoTitle, seoDesc, seoSchemaDesc } = computeSEO(firm, segments);
  const totalCountStr = totalCount >= 1000
    ? Math.floor(totalCount / 1000) + ',000+'
    : String(totalCount) + '+';

  const isClaimed = firm.is_claimed === 1 || firm.is_claimed === true ||
                    String(firm.is_claimed || '').toUpperCase() === 'TRUE';

  const replacements = {
    '{{SEO_TITLE}}':              seoTitle,
    '{{SEO_DESCRIPTION}}':        seoDesc,
    '{{SEO_OG_TITLE}}':           seoTitle,
    '{{SEO_OG_DESCRIPTION}}':     seoDesc,
    '{{SEO_TWITTER_TITLE}}':      seoTitle,
    '{{SEO_TWITTER_DESCRIPTION}}': seoDesc,
    '{{SEO_SCHEMA_DESCRIPTION}}': jsStr(seoSchemaDesc),
    '{{FIRM_NAME}}':              jsStr(firm.name || ''),
    '{{FIRM_CITY}}':              jsStr(firm.city || ''),
    '{{FIRM_CITY_SLUG}}':         citySlug,
    '{{FIRM_SLUG}}':              firmSlug,
    '{{FIRM_ADDRESS}}':           jsStr(firm.address || ''),
    '{{FIRM_POSTCODE}}':          (firm.postcode || '').trim(),
    '{{FIRM_LAT}}':               String(firm.latitude  || ''),
    '{{FIRM_LNG}}':               String(firm.longitude || ''),
    '{{FIRM_COUNTRY_DIR}}':       countryDir,
    '{{FIRM_COUNTRY_CODE}}':      countryCode,
    '{{FIRM_COUNTRY_LABEL}}':     countryLabel,
    '{{FIRM_BADGE_URL}}':         (firm.badge_url || '').trim(),
    '{{FIRM_WEBSITE}}':           (firm.website   || '').trim(),
    '{{FIRM_GOOGLE_RATING}}':     String(firm.rating   || ''),
    '{{FIRM_GOOGLE_REVIEWS}}':    String(firm.reviews  || ''),
    '{{FIRM_SPECIALISMS}}':       jsStr(firm.specialisms || ''),
    '{{FIRM_FEES_FROM}}':         jsStr(firm.fees || ''),
    '{{FIRM_SEGMENT}}':           jsStr(segments),
    '{{FIRM_CERTIFICATIONS}}':    jsStr(firm.accreditations || ''),
    '{{FIRM_EXTRA}}':             jsStr(firm.bio || ''),
    '{{IS_CLAIMED}}':             isClaimed ? 'CLAIMED' : '',
    '{{HAS_SECURE_PORTAL}}':      firm.client_portal ? '1' : '',
    '{{TOTAL_FIRM_COUNT}}':       totalCountStr,
    '{{FIRM_ENQUIRY_LINE}}':      '',
  };

  let html = stripPreviewBlock(template);

  for (const [token, value] of Object.entries(replacements)) {
    // Replace all occurrences (global string replace via split/join)
    html = html.split(token).join(value);
  }

  html = cleanSchema(html, firm);
  return html;
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
  const claimed = firm.is_claimed === 1 || firm.is_claimed === true ||
                  String(firm.is_claimed || '').toUpperCase() === 'TRUE';
  if (claimed)                    boost += 0.15;
  if ((firm.specialisms || '').trim()) boost += 0.06;
  if ((firm.bio || '').trim())         boost += 0.04;
  if ((firm.accreditations || '').trim()) boost += 0.03;
  if ((firm.fees || '').trim())        boost += 0.02;
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

function firmCardHtml(firm, rank, countryDir) {
  const name      = (firm.name || '').trim();
  const firmSlug  = (firm.firm_slug || '').trim() || slugify(name);
  const citySlug  = (firm.city_slug || '').trim() || slugify(firm.city || '');
  const rating    = parseFloat_(firm.rating);
  const reviews   = parseInt_(firm.reviews);
  const suburb    = (firm.suburb || '').trim();
  const city      = (firm.city   || '').trim();
  const loc       = [suburb, city].filter(Boolean).join(', ');
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

  return `<a class="cd-card" href="${profileUrl}" style="animation-delay:${(Math.min(rank - 1, 8) * 0.05 + 0.05).toFixed(2)}s">` +
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
    `<div class="cd-card-cta"><span class="cd-view">Learn more &rarr;</span></div>` +
    `</a>`;
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
    `<p>${esc(cityName)} is home to <strong>${firmCount} accounting firms</strong> on the TaxReady directory${segsText}. ` +
    `Across the city, firms hold an average Google rating of <strong>${avgRating.toFixed(1)}★</strong> over ` +
    `<strong>${totalReviews.toLocaleString('en-GB')} reviews</strong> — a genuine signal of local reputation.</p>`
  );

  if (topByRev.length) {
    const names = topByRev.map(f => `<strong>${esc((f.name || '').trim())}</strong>`);
    const namesText = names.length === 1 ? names[0]
      : names.length === 2 ? names.join(' and ')
      : names.slice(0, -1).join(', ') + `, and ${names[names.length - 1]}`;
    parts.push(
      `<p>The most-reviewed firms in ${esc(cityName)} include ${namesText} — all listed above with full profiles, specialisms, and direct enquiry.</p>`
    );
  }

  parts.push(
    `<p>Not sure who to pick? Our AI reviews all ${firmCount} firms against your situation and returns your top 3 matches in 60 seconds. ` +
    `<a href="/${countryDir}/find-accountant/?city=${citySlugForLink}" style="color:var(--teal);text-decoration:none;border-bottom:1px dotted rgba(0,177,178,.4);">` +
    `Get AI-matched for ${esc(cityName)} &rarr;</a></p>`
  );

  return parts.join('\n    ');
}

function nearbyChipsHtml(currentSlug, nearbyCities) {
  if (!nearbyCities.length) {
    return `<a class="cd-nearby-chip" href="/uk/accounting-firms/">All UK cities &rarr;</a>`;
  }
  const parts = nearbyCities.map(({ citySlug, cityName, count }) =>
    `<a class="cd-nearby-chip" href="/uk/accounting-firms/${citySlug}/">` +
    `${esc(cityName)}<span class="cd-nearby-count">${count}</span></a>`
  );
  parts.push(
    `<a class="cd-nearby-chip" href="/uk/accounting-firms/" style="border-color:var(--teal);color:var(--teal);font-weight:600;">All UK cities &rarr;</a>`
  );
  return parts.join('\n    ');
}

function buildCitySchema(cityName, citySlug, countryDir, firmsRanked, firmCount, avgRating, totalReviews) {
  const canonical = `https://taxready.me/${countryDir}/accounting-firms/${citySlug}/`;
  const today = new Date().toISOString().slice(0, 10);

  const itemListElements = firmsRanked.slice(0, 50).map((f, i) => {
    const name = (f.name || '').trim();
    const fSlug = (f.firm_slug || '').trim() || slugify(name);
    const fCity = (f.city_slug === 'other' && f.suburb_slug) ? f.suburb_slug : citySlug;
    const rating  = parseFloat_(f.rating);
    const reviews = parseInt_(f.reviews);
    const item = {
      '@type': 'AccountingService',
      name,
      url: `https://taxready.me/${countryDir}/accounting-firms/${fCity}/${fSlug}/`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: (f.address || '').trim(),
        postalCode: (f.postcode || '').trim(),
        addressLocality: cityName,
        addressCountry: countryDir === 'au' ? 'AU' : 'GB',
      },
    };
    if (rating > 0 && reviews > 0) {
      item.aggregateRating = { '@type': 'AggregateRating', ratingValue: rating, reviewCount: reviews, bestRating: 5, worstRating: 1 };
    }
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
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://taxready.me/' },
        { '@type': 'ListItem', position: 2, name: `${countryDir.toUpperCase()} accounting firms`, item: `https://taxready.me/${countryDir}/accounting-firms/` },
        { '@type': 'ListItem', position: 3, name: cityName, item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage', '@id': canonical + '#page', url: canonical,
      name: `Best accounting firms in ${cityName}`,
      description: `Compare ${firmCount} local accounting firms in ${cityName}. Ranked by Google reviews · average rating ${avgRating.toFixed(1)}★.`,
      datePublished: '2026-04-01', dateModified: today, inLanguage: 'en-GB',
      isPartOf: { '@type': 'WebSite', name: 'TaxReady', url: 'https://taxready.me/' },
      breadcrumb: { '@id': canonical + '#breadcrumb' },
      mainEntity: { '@id': canonical + '#list' },
    },
    {
      '@type': 'ItemList', '@id': canonical + '#list',
      name: `Accounting firms in ${cityName}`, numberOfItems: firmCount,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement,
    },
  ];

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
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

/**
 * Build a city hub page.
 * @param {string} template - city-template.html content
 * @param {string} countryDir - 'uk' | 'au'
 * @param {string} citySlug - URL slug
 * @param {object[]} firms - D1 rows for this city
 * @param {object[]} nearbyCities - [{citySlug, cityName, count}] sorted nearest-first
 */
export function buildCityPage(template, countryDir, citySlug, firms, nearbyCities) {
  const firmsRanked = [...firms].sort((a, b) => hybridScore(b) - hybridScore(a));

  const cityName = (() => {
    const counts = {};
    for (const f of firmsRanked) {
      const c = (f.city || '').trim();
      if (c) counts[c] = (counts[c] || 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : citySlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  })();

  const firmCount   = firmsRanked.length;
  const rated       = firmsRanked.filter(f => parseInt_(f.reviews) > 0);
  const totalReviews = rated.reduce((s, f) => s + parseInt_(f.reviews), 0);
  const avgRating   = rated.length
    ? rated.reduce((s, f) => s + parseFloat_(f.rating), 0) / rated.length
    : 0;
  const topSegs     = topSegmentsForCity(firmsRanked);
  const canonical   = `https://taxready.me/${countryDir}/accounting-firms/${citySlug}/`;
  const seoTitle    = `Best Accounting Firms in ${cityName} | ${firmCount} Local Firms | TaxReady`;
  let seoDesc       = `Compare ${firmCount} local accounting firms in ${cityName}. Ranked by Google reviews · avg ${avgRating.toFixed(1)}★ over ${totalReviews.toLocaleString('en-GB')} reviews. AI-matched recommendations in 60 seconds.`;
  if (seoDesc.length > 160) seoDesc = seoDesc.slice(0, 157).trimEnd() + '...';

  const firmListHtml  = firmsRanked.map((f, i) => firmCardHtml(f, i + 1, countryDir)).join('\n    ');
  const cityAbout     = cityAboutHtml(cityName, firmsRanked, topSegs, avgRating, totalReviews, countryDir);
  const nearbyHtml    = nearbyChipsHtml(citySlug, nearbyCities);
  const schemaJson    = buildCitySchema(cityName, citySlug, countryDir, firmsRanked, firmCount, avgRating, totalReviews);

  const replacements = {
    '{{CITY_NAME}}':          cityName,
    '{{CITY_SLUG}}':          citySlug,
    '{{FIRM_COUNT}}':         firmCount.toLocaleString('en-GB'),
    '{{AVG_RATING}}':         avgRating.toFixed(2),
    '{{TOTAL_REVIEWS}}':      totalReviews.toLocaleString('en-GB'),
    '{{SEO_TITLE}}':          seoTitle,
    '{{SEO_DESCRIPTION}}':    seoDesc,
    '{{CANONICAL_URL}}':      canonical,
    '{{FIRM_LIST_HTML}}':     firmListHtml,
    '{{CITY_ABOUT_HTML}}':    cityAbout,
    '{{NEARBY_CITIES_HTML}}': nearbyHtml,
    '{{SCHEMA_JSON}}':        schemaJson,
  };

  let html = template;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }
  return html;
}
