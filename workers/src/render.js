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

function isClaimed(firm) {
  return firm.is_claimed === 1 || firm.is_claimed === true ||
         String(firm.is_claimed || '').toUpperCase() === 'TRUE';
}

function computeSEO(firm, segments) {
  const name      = (firm.name || '').trim();
  const city      = (firm.city || '').trim();
  const rating    = parseFloat(firm.rating) || 0;
  const reviews   = parseInt(firm.reviews) || 0;
  const hasBadge  = isTruthy(firm.badge_url);
  const claimed   = isClaimed(firm);

  let qualifier;
  if (hasBadge)                           qualifier = 'Top-rated';
  else if (claimed)                       qualifier = 'Verified';
  else if (reviews >= 10 && rating >= 4.5) qualifier = 'Highly-rated';
  else if (reviews >= 10 && rating >= 4.0) qualifier = 'Well-reviewed';
  else                                     qualifier = '';

  const prefix = qualifier ? `${qualifier} Accountant` : 'Accountant';
  const speciList = (segments || firm.specialisms || '').split(/[,;|]+/).map(s => s.trim()).filter(Boolean);
  const speciSnip = speciList[0] ? ` specialising in ${speciList[0]}` : '';

  // Build raw strings first so the 160-char trim operates on the correct character count.
  const seoTitleRaw = `${name} | ${prefix} in ${city} | TaxReady`;
  const seoDescRaw  = `${name} is ${qualifier ? 'a ' + qualifier.toLowerCase() + ' ' : 'an '}` +
                      `accounting firm in ${city}${speciSnip}. View full profile and get in touch via TaxReady.`;
  const seoDescTrimmedRaw = seoDescRaw.length > 160 ? seoDescRaw.slice(0, 157) + '...' : seoDescRaw;

  return {
    seoTitle:      esc(seoTitleRaw),         // HTML-safe: for <title> and og/twitter meta attributes
    seoDesc:       esc(seoDescTrimmedRaw),   // HTML-safe: for <meta name="description"> attributes
    seoSchemaDesc: seoDescTrimmedRaw,        // Raw: for JSON-LD (further processed by jsStr())
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
  const hasBadge  = isTruthy(firm.badge_url);
  const claimed   = isClaimed(firm);
  const isState5  = !claimed && reviews < 10;

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
    html = html.replace('"sameAs": []', `"sameAs": [${JSON.stringify((firm.website || '').trim())}]`);
  }

  // 5. State 5 (< 10 reviews, unclaimed) → strip FAQ schema block entirely
  if (isState5) {
    html = html.replace(/<!-- FAQ-SCHEMA-START[\s\S]*?<!-- FAQ-SCHEMA-END -->/g, '');
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
  const cc           = (firm.country || 'GB').toUpperCase();
  const countryDir   = cc === 'AU' ? 'au' : cc === 'US' ? 'us' : 'uk';
  const countryCode  = cc === 'AU' ? 'AU' : cc === 'US' ? 'US' : 'GB';
  const countryLabel = cc === 'AU' ? 'Australian' : cc === 'US' ? 'US' : 'UK';

  const citySlug = (firm.city_slug || '').trim() || slugify(firm.city || '');
  const firmSlug = (firm.firm_slug || '').trim() || slugify(firm.name || '');
  const displayCity     = (citySlug === 'other' && (firm.suburb || '').trim())
                            ? (firm.suburb || '').trim()
                            : (firm.city   || '').trim();
  const displayCitySlug = (citySlug === 'other' && (firm.suburb_slug || '').trim())
                            ? (firm.suburb_slug || '').trim()
                            : citySlug;
  const segments = deriveSegments(firm);
  const { seoTitle, seoDesc, seoSchemaDesc } = computeSEO(firm, segments);
  const totalCountStr = totalCount >= 1000
    ? Math.floor(totalCount / 1000) + ',000+'
    : String(totalCount) + '+';

  const claimed = isClaimed(firm);

  // Location suffix: state code for US, country name for UK/AU
  const locationSuffix = cc === 'US'
    ? (firm.suburb || '').trim().toUpperCase() || 'US'
    : cc === 'AU' ? 'Australia' : 'United Kingdom';

  // Tax estimator and mega menu columns: UK-only
  const taxEstimatorDisplay = cc === 'GB' ? '' : 'style="display:none"';
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
      <a class="tx-footer-brand-logo" href="/au/"><img src="/assets/taxready.svg" alt="TaxReady"></a>
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
    <span class="tx-footer-bar-legal"><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a></span>
  </div>
</footer>` : cc === 'US' ? `<footer class="tx-footer">
  <div class="tx-footer-inner">
    <div class="tx-footer-brand">
      <a class="tx-footer-brand-logo" href="/us/"><img src="/assets/taxready.svg" alt="TaxReady"></a>
      <p class="tx-footer-tagline">The US&rsquo;s <em>only</em> AI-powered accountant directory. AI-matched local CPAs and accountants from thousands of verified US firms.</p>
      <a class="tx-footer-partner" href="https://workiro.com" target="_blank" rel="noopener" aria-label="Workiro"><span class="tx-footer-partner-label">Powered by</span><img class="tx-footer-partner-logo" src="/assets/workiro-logo-light-bg.svg" alt="Workiro" loading="lazy"></a>
      <p class="tx-footer-partner-note">Built on the same secure platform that regulated professionals use to protect their clients&rsquo; data. <a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro &rarr;</a></p>
    </div>
    <div class="tx-footer-col"><h4>Find an accountant</h4><ul>
      <li><a href="/us/find-accountant/">Find my AI-matched accountant</a></li>
      <li><a href="/us/accounting-firms/">Browse all US firms</a></li>
    </ul></div>
    <div class="tx-footer-col tx-footer-col--accent"><h4>For accountants</h4><ul>
      <li><a class="is-primary" href="/us/for-accountants/">Claim your free profile</a></li>
      <li><a href="/us/accounting-firms/">Find your existing listing</a></li>
      <li><a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro</a></li>
    </ul></div>
  </div>
  <div class="tx-footer-bar">
    <span>&copy; 2026 TaxReady &middot; Powered by <a href="https://www.workiro.com/" target="_blank" rel="noopener">Workiro</a></span>
    <span class="tx-footer-bar-legal"><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a></span>
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
    <span class="tx-footer-bar-legal"><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a><span>&middot;</span><span class="tx-footer-disclaimer">Estimates only &mdash; not financial or tax advice.</span></span>
  </div>
</footer>`;

  const replacements = {
    // {{FOOTER_HTML}} MUST be first so the footer is injected before {{FIRM_SLUG}} and
    // {{FIRM_CITY_SLUG}} are processed — otherwise those tokens inside the footer's claim
    // URL would be inserted after their replacement passes have already run.
    '{{FOOTER_HTML}}':              profileFooterHtml,
    '{{SEO_TITLE}}':              seoTitle,
    '{{SEO_DESCRIPTION}}':        seoDesc,
    '{{SEO_OG_TITLE}}':           seoTitle,
    '{{SEO_OG_DESCRIPTION}}':     seoDesc,
    '{{SEO_TWITTER_TITLE}}':      seoTitle,
    '{{SEO_TWITTER_DESCRIPTION}}': seoDesc,
    '{{SEO_SCHEMA_DESCRIPTION}}': jsStr(seoSchemaDesc),
    '{{FIRM_NAME}}':              jsStr(firm.name || ''),
    '{{FIRM_CITY}}':              jsStr(displayCity),
    '{{FIRM_CITY_SLUG}}':         displayCitySlug,
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
    '{{FIRM_DIFFERENTIATORS}}':   jsStr(firm.differentiators || ''),
    '{{FIRM_SEGMENT}}':           jsStr(segments),
    '{{FIRM_CERTIFICATIONS}}':    jsStr(firm.accreditations || ''),
    '{{FIRM_EXTRA}}':             jsStr(firm.bio || ''),
    '{{IS_CLAIMED}}':             claimed ? 'CLAIMED' : '',
    '{{HAS_SECURE_PORTAL}}':      firm.client_portal ? '1' : '',
    '{{TOTAL_FIRM_COUNT}}':         totalCountStr,
    '{{FIRM_ENQUIRY_LINE}}':        '',
    '{{FIRM_LOCATION_SUFFIX}}':     locationSuffix,
    '{{TAX_ESTIMATOR_DISPLAY}}':    taxEstimatorDisplay,
    '{{MENU_CITY_LIST}}':           menuCityList,
    '{{MENU_TAX_COL}}':             menuTaxCol,
    '{{LOGO_SRC}}':                 cc === 'US' ? '/assets/taxready.svg' : '/assets/taxready.svg',
    '{{HOW_CLIENTS_FIND_LIST}}':    cc === 'US'
      ? `<li style="margin-bottom:6px;"><strong style="color:#0f0f0e;">AI zip code match</strong> &middot; <a href="/us/find-accountant/" style="color:#00B1B2;font-weight:600;text-decoration:none;border-bottom:1px dotted rgba(0,177,178,.5);">/find-accountant</a> picks a client&rsquo;s top 3 local firms in 60 seconds.</li>
        <li><strong style="color:#0f0f0e;">Google &amp; direct</strong> &middot; this profile page is SEO-optimised to rank for your firm name plus local searches (<em>&ldquo;accountant ${esc(displayCity)}&rdquo;</em>), driving enquiries directly to you.</li>`
      : `<li style="margin-bottom:6px;"><strong style="color:#0f0f0e;">AI postcode match</strong> &middot; <a href="/uk/find-accountant/" style="color:#00B1B2;font-weight:600;text-decoration:none;border-bottom:1px dotted rgba(0,177,178,.5);">/find-accountant</a> picks a taxpayer&rsquo;s top 3 local firms in 60 seconds.</li>
        <li style="margin-bottom:6px;"><strong style="color:#0f0f0e;">Free tax estimator</strong> &middot; taxpayers start an estimate, get matched to a local specialist at the end.</li>
        <li><strong style="color:#0f0f0e;">Google &amp; direct</strong> &middot; this profile page is SEO-optimised to rank for your firm name plus local searches (<em>&ldquo;accountant ${esc(displayCity)}&rdquo;</em>), with an integrated tax estimator and overpayment radar built in to convert visitors into enquiries.</li>`,
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

function firmCardHtml(firm, rank, countryDir) {
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
        addressCountry: countryDir === 'au' ? 'AU' : countryDir === 'us' ? 'US' : 'GB',
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
      itemListElement: itemListElements,
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
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://taxready.me/' },
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
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
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
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://taxready.me/' },
        { '@type': 'ListItem', position: 2, name: 'US accounting firms', item: 'https://taxready.me/us/accounting-firms/' },
        { '@type': 'ListItem', position: 3, name: stateName, item: canonical },
      ],
    },
    {
      '@type': 'CollectionPage', '@id': canonical + '#page', url: canonical,
      name: `Accounting Firms in ${stateName}`,
      description: `Browse ${firmCount.toLocaleString('en-US')} verified accounting firms across ${cities.length} cities in ${stateName}. Average rating ${avgRating.toFixed(1)}★.`,
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
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
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
    `<div class="dr-tile-meta">${s.firmCount.toLocaleString('en-US')} firms` +
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
  const seoTitle    = `Best Accounting Firms in ${stateName} | ${firmCount.toLocaleString('en-US')} Local Firms | TaxReady`;
  let   seoDesc     = `Browse ${firmCount.toLocaleString('en-US')} verified accounting firms across ${cityCount} cities in ${stateName}. AI-matched in 60 seconds.`;
  if (seoDesc.length > 160) seoDesc = seoDesc.slice(0, 157).trimEnd() + '...';

  const tileHtml = cities.map(c =>
    `<a class="dr-tile" href="/us/accounting-firms/${c.citySlug}/" data-city-name="${esc(c.cityName)}">` +
    `<h3 class="dr-tile-name">${esc(c.cityName)}</h3>` +
    `<div class="dr-tile-meta">${c.firmCount.toLocaleString('en-US')} firms` +
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
  const seoTitle    = `Best Accounting Firms in ${cityName} | ${firmCount} Local Firms | TaxReady`;
  let seoDesc       = `Compare ${firmCount} local accounting firms in ${cityName}. Ranked by Google reviews · avg ${avgRating.toFixed(1)}★ over ${totalReviews.toLocaleString('en-GB')} reviews. AI-matched recommendations in 60 seconds.`;
  if (seoDesc.length > 160) seoDesc = seoDesc.slice(0, 157).trimEnd() + '...';

  const hreflang      = countryDir === 'au' ? 'en-au' : countryDir === 'us' ? 'en-us' : 'en-gb';
  const firmListHtml  = firmsRanked.map((f, i) => firmCardHtml(f, i + 1, countryDir)).join('\n    ');
  const cityAbout     = cityAboutHtml(cityName, firmsRanked, topSegs, avgRating, totalReviews, countryDir);
  const nearbyHtml    = nearbyChipsHtml(citySlug, nearbyCities, countryDir);
  const schemaJson    = buildCitySchema(cityName, citySlug, countryDir, firmsRanked, firmCount, avgRating, totalReviews);

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
    </div>` : cc === 'AU' || countryDir === 'au' ? `
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
      <a class="tx-footer-brand-logo" href="/us/"><img src="/assets/taxready.svg" alt="TaxReady"></a>
      <p class="tx-footer-tagline">The US&rsquo;s <em>only</em> AI-powered accountant directory. AI-matched local CPAs and accountants from thousands of verified US firms.</p>
      <a class="tx-footer-partner" href="https://workiro.com" target="_blank" rel="noopener" aria-label="Workiro"><span class="tx-footer-partner-label">Powered by</span><img class="tx-footer-partner-logo" src="/assets/workiro-logo-light-bg.svg" alt="Workiro" loading="lazy"></a>
      <p class="tx-footer-partner-note">Built on the same secure platform that regulated professionals use to protect their clients&rsquo; data. <a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro &rarr;</a></p>
    </div>
    <div class="tx-footer-col"><h4>Find an accountant</h4><ul>
      <li><a href="/us/find-accountant/">Find my AI-matched accountant</a></li>
      <li><a href="/us/accounting-firms/">Browse all US firms</a></li>
    </ul></div>
    <div class="tx-footer-col tx-footer-col--accent"><h4>For accountants</h4><ul>
      <li><a class="is-primary" href="/us/for-accountants/">Claim your free profile</a></li>
      <li><a href="/us/accounting-firms/">Find your existing listing</a></li>
      <li><a href="https://www.workiro.com/" target="_blank" rel="noopener">About Workiro</a></li>
    </ul></div>
  </div>
  <div class="tx-footer-bar">
    <span>&copy; 2026 TaxReady &middot; Powered by <a href="https://www.workiro.com/" target="_blank" rel="noopener">Workiro</a></span>
    <span class="tx-footer-bar-legal"><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a></span>
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
    <span class="tx-footer-bar-legal"><a href="https://www.workiro.com/terms-and-policies/privacy-notice" target="_blank" rel="noopener">Privacy</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/terms-of-service" target="_blank" rel="noopener">Terms</a><span>&middot;</span><a href="https://www.workiro.com/terms-and-policies/taxready" target="_blank" rel="noopener">Disclaimer</a><span>&middot;</span><span class="tx-footer-disclaimer">Estimates only &mdash; not financial or tax advice.</span></span>
  </div>
</footer>`;

  const replacements = {
    '{{CITY_NAME}}':          cityName,
    '{{CITY_SLUG}}':          citySlug,
    '{{FIRM_COUNT}}':         firmCount.toLocaleString('en-GB'),
    '{{AVG_RATING}}':         avgRating.toFixed(2),
    '{{TOTAL_REVIEWS}}':      totalReviews.toLocaleString('en-GB'),
    '{{SEO_TITLE}}':          seoTitle,
    '{{SEO_DESCRIPTION}}':    seoDesc,
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
    '{{LOGO_SRC}}':           countryDir === 'us' ? '/assets/taxready.svg' : '/assets/taxready.svg',
  };

  let html = template;
  for (const [token, value] of Object.entries(replacements)) {
    html = html.split(token).join(value);
  }
  return html;
}
