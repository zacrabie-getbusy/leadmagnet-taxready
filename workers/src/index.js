/**
 * TaxReady Cloudflare Worker
 *
 * Serves the accounting-firm directory (profiles, city hubs, US state pages)
 * server-rendered from Cloudflare D1, turns legacy URLs into real 301s, and
 * handles the /api/* endpoints. Everything else passes through to the
 * GitHub Pages origin unchanged. Routes are listed in wrangler.toml.
 */

import PROFILE_TEMPLATE     from '../../accountant-profile-template.html';
import CITY_TEMPLATE         from '../../city-template.html';
import STATE_INDEX_TEMPLATE  from '../../us-state-index-template.html';
import STATE_HUB_TEMPLATE    from '../../us-state-hub-template.html';
import AU_STATE_INDEX_TEMPLATE from '../../au-state-index-template.html';
import AU_STATE_HUB_TEMPLATE   from '../../au-state-hub-template.html';
// Old mangled (latin-1 decoded) slugs → new ASCII paths. Written by import_csv_to_d1.py.
import SLUG_REDIRECTS        from '../slug_redirects.json';
import { buildFirmProfile, buildCityPage, buildStateIndexPage, buildStateHubPage, STATE_REGIONS,
         profileHubSlug, similarCandidates } from './render.js';

const SITE = 'https://taxready.me';
// Minimum firms per city to show a city hub — 1 allows small suburb pages to
// render (hubs with 1–2 firms are served noindex; see render.js hubTier).
const MIN_FIRMS_FOR_CITY   = 1;
// Minimum firms to appear as a "nearby city" chip on other city hub pages
const MIN_FIRMS_FOR_NEARBY = 3;
// Lifetime of cached D1 lookups (firm counts, nearby cities, similar firms)
const DATA_TTL_SECONDS     = 3600;

const COUNTRY_OF = { uk: 'GB', us: 'US', au: 'AU' };

// Legacy URLs → canonical destinations. These replace the GitHub Pages
// "Redirecting…" stubs (200 + meta refresh) with real 301s. The stub files stay
// in the repo until this Worker is live, then get deleted in a follow-up.
const LEGACY_301 = {
  '/index.html':                  '/uk/',
  '/accountants':                 '/uk/for-accountants/',
  '/accountants.html':            '/uk/for-accountants/',
  '/uk/accountants.html':         '/uk/for-accountants/',
  '/find-accountant.html':        '/uk/',
  // The map search is now the country home page.
  '/uk/find-accountant':          '/uk/',
  '/uk/find-accountant/':         '/uk/',
  '/us/find-accountant':          '/us/',
  '/us/find-accountant/':         '/us/',
  '/construction.html':           '/uk/estimate/construction/',
  '/creative.html':               '/uk/estimate/creative/',
  '/freelancer.html':             '/uk/estimate/freelancer/',
  '/healthcare.html':             '/uk/estimate/healthcare/',
  '/hospitality.html':            '/uk/estimate/hospitality/',
  '/landlord.html':               '/uk/estimate/landlord/',
  '/retail.html':                 '/uk/estimate/retail/',
  '/othersmallbusiness.html':     '/uk/estimate/small-business/',
  '/uk/accounting-firms/essex/':  '/uk/accounting-firms/chelmsford/',
  // The "Other" bucket isn't a place — its firms live under their suburb hub.
  '/uk/accounting-firms/other/':  '/uk/accounting-firms/',
  '/us/accounting-firms/other/':  '/us/accounting-firms/',
  '/au/accounting-firms/other/':  '/au/accounting-firms/',
};

export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;
    const isRead = request.method === 'GET' || request.method === 'HEAD';

    // ── www → apex, straight to the final destination (one hop) ──────────
    if (url.hostname === 'www.taxready.me') {
      if (!isRead) return fetch(request);
      const target = (await resolveRedirect(env, path)) || path;
      return Response.redirect(SITE + target + url.search, 301);
    }

    // ── Enquiry form submissions ───────────────────────────────────────────
    if (request.method === 'POST' && path === '/api/enquiry') {
      return handleEnquiry(request, env);
    }

    // ── Accounting firm claim/profile ─────────────────────────────────────
    if (path === '/api/claim') {
      if (request.method === 'GET')  return handleClaimGet(request, env, url);
      if (request.method === 'POST') return handleClaimPost(request, env);
      return new Response('Method not allowed', { status: 405 });
    }

    // ── Firm data lookup for claim form pre-fill ──────────────────────────
    if (path === '/api/firm') return handleFirmGet(env, url);

    // ── All firms JSON feed for find-accountant page ───────────────────────
    if (path === '/api/firms') return handleFirmsApi(env, url);

    // ── Visitor country for the "Looking for a US CPA?" banner on /uk/ ────
    if (path === '/api/geo') return handleGeo(request);

    // ── Redirects: root, legacy stubs, pre-/uk/ paths, "other" bucket,
    //    mangled slugs, missing trailing slash — always a single 301 ────────
    if (isRead) {
      const target = await resolveRedirect(env, path);
      if (target) return Response.redirect(SITE + target + url.search, 301);
    }

    // ── State index (US, AU): /{us|au}/accounting-firms/ ─────────────────
    const stateIndex = path.match(/^\/(us|au)\/accounting-firms\/$/);
    if (stateIndex) {
      const countryDir = stateIndex[1];
      return servePage(countryDir, () => handleStateIndex(env, ctx, countryDir, url));
    }

    // ── Firm profile: /{uk|au|us}/accounting-firms/{city}/{firm}/ ─────────
    const firmMatch = path.match(/^\/(uk|au|us)\/accounting-firms\/([^/]+)\/([^/]+)\/$/);
    if (firmMatch) {
      const [, countryDir, citySlug, firmSlug] = firmMatch;
      return servePage(countryDir, () => handleFirmProfile(env, ctx, countryDir, citySlug, firmSlug, url));
    }

    // ── City hub / US state hub: /{uk|au|us}/accounting-firms/{slug}/ ────
    const cityMatch = path.match(/^\/(uk|au|us)\/accounting-firms\/([^/]+)\/$/);
    if (cityMatch) {
      const [, countryDir, slug] = cityMatch;
      const region = STATE_REGIONS[countryDir];
      if (region && region.codes.has(slug)) {
        return servePage(countryDir, () => handleStateHub(env, ctx, countryDir, slug, url));
      }
      return servePage(countryDir, () => handleCityHub(env, ctx, countryDir, slug, url));
    }

    // ── Everything else: pass through to GitHub Pages origin ──────────────
    return fetch(request);
  },
};

// ─── Redirects ────────────────────────────────────────────────────────────────

/**
 * Final destination path for a URL that should 301, or null. Chains are
 * collapsed here so every redirect is one hop: e.g. the pre-/uk/ path
 * /accounting-firms/other/{firm}.html goes straight to /uk/accounting-firms/{suburb}/{firm}/.
 */
async function resolveRedirect(env, path) {
  if (path === '/') return '/uk/';
  if (LEGACY_301[path]) return LEGACY_301[path];

  let p = path;
  let m;
  // Old GitHub Pages build: /accounting-firms/{city}/{firm}(.html) and /accounting-firms/{city}/
  if ((m = p.match(/^\/accounting-firms\/([^/]+)\/([^/]+?)(?:\.html)?\/?$/))) {
    p = `/uk/accounting-firms/${m[1]}/${m[2]}/`;
  } else if ((m = p.match(/^\/accounting-firms\/([^/]+)\/?$/))) {
    p = `/uk/accounting-firms/${m[1]}/`;
  }
  // Canonical form has a trailing slash (matches the sitemap)
  if (/^\/(uk|au|us)\/accounting-firms(\/[^/]+){0,2}$/.test(p)) p += '/';
  if (LEGACY_301[p]) return LEGACY_301[p];

  let decoded = p;
  try { decoded = decodeURIComponent(p); } catch { /* leave as-is */ }
  const fm = decoded.match(/^\/(uk|au|us)\/accounting-firms\/([^/]+)\/([^/]+)\/$/);
  if (fm) {
    const [, dir, city, firm] = fm;
    const renamed = SLUG_REDIRECTS[`${dir}/${city}/${firm}`];
    if (renamed) return renamed;
    if (city === 'other') {
      const hub = await otherFirmHub(env, dir, firm);
      if (hub) return `/${dir}/accounting-firms/${hub}/${firm}/`;
    }
  }
  return p !== path ? p : null;
}

/** Suburb hub for a firm stored in the "other" city bucket, or null. */
async function otherFirmHub(env, countryDir, firmSlug) {
  try {
    const row = await dbFirst(env,
      `SELECT suburb_slug FROM firms
       WHERE firm_slug = ? AND city_slug = 'other' AND country = ? AND suburb_slug != ''
       ORDER BY id LIMIT 1`,
      firmSlug, COUNTRY_OF[countryDir] || 'GB');
    return row ? row.suburb_slug : null;
  } catch (err) {
    console.error('[redirect] other-firm lookup failed:', err);
    return null;
  }
}

// ─── Page plumbing ────────────────────────────────────────────────────────────

/**
 * Run a page handler; on any error log it and serve the noindex 404 page
 * rather than a 5xx (uncached, so the next request retries).
 */
async function servePage(countryDir, handler) {
  try {
    return await handler();
  } catch (err) {
    console.error('[page] render failed:', err && err.stack ? err.stack : err);
    return notFoundResponse(countryDir, { cache: false });
  }
}

/** Edge-cache key: path only, so tracking query strings don't bypass the cache. */
function pageCacheKey(url) {
  return new Request(url.origin + url.pathname, { method: 'GET' });
}

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type':  'text/html;charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}

/** Return the response now; write it to the edge cache in the background. */
function cacheAndReturn(ctx, cacheKey, response) {
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()).catch(err => console.error('[cache] put failed:', err)));
  return response;
}

// D1 calls get one retry: transient D1 errors under crawl load were the
// likeliest source of the 503s Ahrefs saw on otherwise-healthy profiles.
async function withRetry(fn) {
  try { return await fn(); }
  catch (err) {
    console.warn('[d1] retrying after error:', err && err.message ? err.message : err);
    return fn();
  }
}
function dbFirst(env, sql, ...binds) {
  return withRetry(() => env.DB.prepare(sql).bind(...binds).first());
}
function dbAll(env, sql, ...binds) {
  return withRetry(async () => (await env.DB.prepare(sql).bind(...binds).all()).results || []);
}

// Small lookups shared across many pages (country firm counts, nearby cities,
// similar firms) are cached in isolate memory AND the Cache API, so a fresh
// isolate doesn't re-run them against D1.
const _memo = new Map();
async function cachedJSON(ctx, key, compute) {
  const now = Date.now();
  const hit = _memo.get(key);
  if (hit && hit.expires > now) return hit.value;

  const cacheKey = new Request(`${SITE}/__worker-cache/${key}`, { method: 'GET' });
  let value;
  try {
    const cached = await caches.default.match(cacheKey);
    if (cached) value = await cached.json();
  } catch { /* fall through to compute */ }
  if (value === undefined) {
    value = await compute();
    ctx.waitUntil(caches.default.put(cacheKey, new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${DATA_TTL_SECONDS}` },
    })).catch(err => console.error('[cache] put failed:', err)));
  }
  if (_memo.size > 2000) _memo.clear();
  _memo.set(key, { value, expires: now + DATA_TTL_SECONDS * 1000 });
  return value;
}

function getCountryFirmCount(env, ctx, country) {
  return cachedJSON(ctx, `count/${country}`, async () => {
    const row = await dbFirst(env, 'SELECT COUNT(*) AS cnt FROM firms WHERE country = ?', country);
    return row ? row.cnt : 0;
  });
}

/**
 * Indexable firms in a hub for the profile "Similar firms" module. The SQL
 * filter is a cheap superset of render.js isProfileIndexable() (a 25-word bio
 * needs at least 49 characters); similarCandidates() applies the exact rule.
 */
function getSimilarCandidates(env, ctx, country, hubSlug) {
  return cachedJSON(ctx, `similar/${country}/${hubSlug}`, async () => {
    const rows = await dbAll(env,
      `SELECT name, firm_slug, city_slug, suburb_slug, city, suburb, rating, reviews, is_claimed,
              bio, specialisms, website, accreditations, differentiators, specialist_segments, ch_number, tpb_number,
              flag_hospitality, flag_construction, flag_healthcare, flag_media,
              flag_professional_services, flag_real_estate
       FROM firms
       WHERE (city_slug = ? OR (city_slug = 'other' AND suburb_slug = ?)) AND country = ?
         AND (is_claimed = 1 OR ((specialisms != '' OR website != '') AND (length(bio) >= 49 OR ch_number != '' OR tpb_number != '')))`,
      hubSlug, hubSlug, country);
    return similarCandidates(rows);
  });
}

function handleGeo(request) {
  const country = (request.cf && request.cf.country) || '';
  return new Response(JSON.stringify({ country }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Derive the ISO 3166-1 alpha-2 country code from the page the form was
// submitted from. Reads the Referer header so no client changes are needed;
// AU and US sites will resolve automatically once those paths go live.
function countryFromReferer(request) {
  const ref = request.headers.get('Referer') || '';
  if (/\/au\//.test(ref)) return 'AU';
  if (/\/us\//.test(ref)) return 'US';
  return 'GB';
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleEnquiry(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response('Bad request', { status: 400 }); }

  const { name, email, phone, message, firm_name, source,
          biz_structure, tier, income, notes } = body;

  const dbMessage = message || [biz_structure, tier, notes].filter(Boolean).join(' | ');
  const country = countryFromReferer(request);

  const [supaRes, zapierRes] = await Promise.all([
    fetch(`${env.SUPABASE_URL}/rest/v1/tax_enquiries`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        env.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ name, email, phone: phone || null, message: dbMessage,
                             firm_name: firm_name || '', source: source || 'unknown', country }),
    }).catch(err => { console.error('[enquiry] supabase error:', err); return null; }),

    fetch(env.ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, country, timestamp: new Date().toISOString() }),
    }).catch(err => { console.error('[enquiry] zapier error:', err); return null; }),
  ]);

  if (!supaRes?.ok)   console.error('[enquiry] supabase status:', supaRes?.status);
  if (!zapierRes?.ok) console.error('[enquiry] zapier status:', zapierRes?.status);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleClaimGet(request, env, url) {
  const email = url.searchParams.get('email');
  if (!email) return new Response('null', { headers: { 'Content-Type': 'application/json' } });

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/accounting_firms?email=eq.${encodeURIComponent(email)}&select=*&limit=1`,
    { headers: { 'apikey': env.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY } }
  ).catch(() => null);

  if (!res || !res.ok) return new Response('null', { status: 502, headers: { 'Content-Type': 'application/json' } });
  const rows = await res.json();
  return new Response(JSON.stringify(rows[0] || null), { headers: { 'Content-Type': 'application/json' } });
}

async function handleClaimPost(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response('Bad request', { status: 400 }); }

  const { trigger_zapier, ...payload } = body;
  const ts = new Date().toISOString();
  const country = countryFromReferer(request);

  const tasks = [
    fetch(`${env.SUPABASE_URL}/rest/v1/accounting_firms?on_conflict=email`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        env.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ ...payload, country, updated_at: ts }),
    }).catch(err => { console.error('[claim] supabase error:', err); return null; }),
  ];

  if (trigger_zapier) {
    tasks.push(
      fetch(env.CLAIM_ZAPIER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, country, timestamp: ts }),
      }).catch(err => { console.error('[claim] zapier error:', err); return null; })
    );
  }

  const results = await Promise.all(tasks);
  if (!results[0]?.ok) console.error('[claim] supabase status:', results[0]?.status);

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
}

async function handleFirmGet(env, url) {
  const firmSlug = url.searchParams.get('firm_slug');
  const citySlug = url.searchParams.get('city_slug');
  if (!firmSlug || !citySlug) {
    return new Response('null', { headers: { 'Content-Type': 'application/json' } });
  }
  const firm = await env.DB.prepare(
    `SELECT name, city, specialisms, client_type, accreditations FROM firms
     WHERE firm_slug = ?
       AND (city_slug = ? OR (city_slug = 'other' AND suburb_slug = ?))
     LIMIT 1`
  ).bind(firmSlug, citySlug, citySlug).first();
  return new Response(JSON.stringify(firm || null), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleFirmProfile(env, ctx, countryDir, citySlug, firmSlug, url) {
  const cacheKey = pageCacheKey(url);
  const cached   = await caches.default.match(cacheKey);
  if (cached) return cached;

  const country = COUNTRY_OF[countryDir];

  // Look up firm: match on city_slug+firm_slug OR on 'other' city with suburb_slug match.
  // Country filter prevents a US firm from being served at a /uk/ URL.
  const firm = await dbFirst(env,
    `SELECT * FROM firms
     WHERE firm_slug = ?
       AND (city_slug = ? OR (city_slug = 'other' AND suburb_slug = ?))
       AND country = ?
     ORDER BY id
     LIMIT 1`,
    firmSlug, citySlug, citySlug, country);

  if (!firm) {
    return notFoundResponse(countryDir);
  }

  // One URL per profile: the hub it's canonicalised to.
  const hub = profileHubSlug(firm);
  if (hub !== citySlug) {
    return Response.redirect(`${SITE}/${countryDir}/accounting-firms/${hub}/${firmSlug}/`, 301);
  }

  const [totalCount, similar] = await Promise.all([
    getCountryFirmCount(env, ctx, country),
    hub === 'other' ? Promise.resolve([]) : getSimilarCandidates(env, ctx, country, hub),
  ]);
  const html = buildFirmProfile(PROFILE_TEMPLATE, firm, { totalCount, similar });
  return cacheAndReturn(ctx, cacheKey, htmlResponse(html));
}

async function handleCityHub(env, ctx, countryDir, citySlug, url) {
  const cacheKey = pageCacheKey(url);
  const cached   = await caches.default.match(cacheKey);
  if (cached) return cached;

  const country = COUNTRY_OF[countryDir];

  // Fetch all firms for this city (including suburb_slug-based lookups for 'other')
  const firms = await dbAll(env,
    `SELECT * FROM firms
     WHERE (city_slug = ? OR (city_slug = 'other' AND suburb_slug = ?))
       AND country = ?
     ORDER BY id`,
    citySlug, citySlug, country);

  if (firms.length < MIN_FIRMS_FOR_CITY) {
    return notFoundResponse(countryDir);
  }

  const [nearby, countryFirmCount] = await Promise.all([
    getNearbyCities(env, ctx, citySlug, country, firms),
    getCountryFirmCount(env, ctx, country),
  ]);
  const html = buildCityPage(CITY_TEMPLATE, countryDir, citySlug, firms, nearby, countryFirmCount);
  return cacheAndReturn(ctx, cacheKey, htmlResponse(html));
}

// ─── Nearby cities (geographic) ───────────────────────────────────────────

async function getNearbyCities(env, ctx, currentSlug, country, currentFirms) {
  // Hub centroids, one D1 query per country per hour. Grouped by the hub a
  // firm is served under — "other"-bucket firms count towards their suburb's
  // hub (e.g. Reading), never towards an "other" chip.
  const hubs = await cachedJSON(ctx, `nearby/${country}`, () => dbAll(env,
    `SELECT CASE WHEN city_slug = 'other' THEN suburb_slug ELSE city_slug END AS hub_slug,
            AVG(latitude) AS avg_lat, AVG(longitude) AS avg_lng, COUNT(*) AS firm_count,
            MAX(CASE WHEN city_slug = 'other' THEN suburb ELSE city END) AS city_name
     FROM firms
     WHERE country = ? AND latitude IS NOT NULL AND longitude IS NOT NULL
       AND NOT (city_slug = 'other' AND (suburb_slug IS NULL OR suburb_slug = ''))
     GROUP BY hub_slug
     HAVING COUNT(*) >= ?`,
    country, MIN_FIRMS_FOR_NEARBY));

  // Average centroid for the current city
  const validFirms = currentFirms.filter(f => f.latitude && f.longitude);
  if (!validFirms.length) return [];
  const curLat = validFirms.reduce((s, f) => s + f.latitude, 0) / validFirms.length;
  const curLng = validFirms.reduce((s, f) => s + f.longitude, 0) / validFirms.length;

  // Euclidean distance (fine for UK/AU/US scale comparisons)
  const sorted = hubs
    .filter(c => c.hub_slug && c.hub_slug !== currentSlug && c.hub_slug !== 'other')
    .map(c => ({
      ...c,
      dist: Math.hypot(c.avg_lat - curLat, c.avg_lng - curLng),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);

  return sorted.map(c => ({
    citySlug: c.hub_slug,
    cityName: (c.city_name || '').trim() || c.hub_slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    count:    c.firm_count,
  }));
}

// ─── Firms API (used by find-accountant.html map) ─────────────────────────

const FIRMS_FLAG_MAP = {
  flag_hospitality:           'Hospitality',
  flag_construction:          'Construction',
  flag_healthcare:            'Healthcare',
  flag_media:                 'Media & Creative',
  flag_professional_services: 'Professional Services',
  flag_real_estate:           'Real Estate',
};

async function handleFirmsApi(env, url) {
  const countryFilter = (url.searchParams.get('country') || '').toUpperCase() || null;
  const { results } = await env.DB.prepare(
    `SELECT name, city, postcode, rating, reviews, latitude, longitude,
            firm_slug, city_slug, suburb_slug, is_claimed, badge_url,
            specialist_segments, specialisms, country,
            flag_hospitality, flag_construction, flag_healthcare,
            flag_media, flag_professional_services, flag_real_estate
     FROM firms
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND name != ''
       AND (? IS NULL OR country = ?)`
  ).bind(countryFilter, countryFilter).all();

  const firms = (results || []).map(f => {
    let segments = (f.specialist_segments || '').trim();
    if (!segments) {
      segments = Object.keys(FIRMS_FLAG_MAP)
        .filter(k => f[k] === 1)
        .map(k => FIRMS_FLAG_MAP[k])
        .join(', ');
    }
    return {
      name:       f.name,
      city:       f.city,
      postcode:   (f.postcode || '').toUpperCase(),
      rating:     f.rating  || 0,
      reviews:    f.reviews || 0,
      lat:        f.latitude,
      lng:        f.longitude,
      firmSlug:   f.firm_slug,
      citySlug:   f.city_slug,
      suburbSlug: f.suburb_slug || '',
      claimed:    f.is_claimed === 1,
      hasBadge:   !!(f.badge_url || '').trim(),
      country:    f.country || 'GB',
      segments,
      specialisms: (f.specialisms || '').trim(),
    };
  });

  return new Response(JSON.stringify(firms), {
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}

// ─── State index (US, AU) ─────────────────────────────────────────────────

const STATE_TEMPLATES = {
  us: { index: STATE_INDEX_TEMPLATE,    hub: STATE_HUB_TEMPLATE },
  au: { index: AU_STATE_INDEX_TEMPLATE, hub: AU_STATE_HUB_TEMPLATE },
};

async function handleStateIndex(env, ctx, countryDir, url) {
  const cacheKey = pageCacheKey(url);
  const cached   = await caches.default.match(cacheKey);
  if (cached) return cached;

  const region = STATE_REGIONS[countryDir];
  const results = await dbAll(env,
    `SELECT suburb_slug, COUNT(*) AS firm_count, AVG(rating) AS avg_rating
     FROM firms WHERE country = ? AND suburb_slug != ''
     GROUP BY suburb_slug ORDER BY firm_count DESC`,
    COUNTRY_OF[countryDir]);
  if (!results.length) return notFoundResponse(countryDir);

  const states = results.filter(r => region.codes.has(r.suburb_slug)).map(r => ({
    stateCode: r.suburb_slug,
    stateName: region.names[r.suburb_slug] || r.suburb_slug.toUpperCase(),
    firmCount: r.firm_count,
    avgRating: parseFloat(r.avg_rating) || 0,
  }));

  const html = buildStateIndexPage(STATE_TEMPLATES[countryDir].index, states, countryDir);
  return cacheAndReturn(ctx, cacheKey, htmlResponse(html));
}

// ─── State hub (US, AU) ────────────────────────────────────────────────────

async function handleStateHub(env, ctx, countryDir, stateCode, url) {
  const cacheKey = pageCacheKey(url);
  const cached   = await caches.default.match(cacheKey);
  if (cached) return cached;

  const results = await dbAll(env,
    `SELECT city_slug, city, COUNT(*) AS firm_count, AVG(rating) AS avg_rating
     FROM firms WHERE country = ? AND suburb_slug = ?
     GROUP BY city_slug, city ORDER BY firm_count DESC`,
    COUNTRY_OF[countryDir], stateCode);

  if (results.length === 0) {
    return notFoundResponse(countryDir);
  }

  const cities = results.map(r => ({
    citySlug:  r.city_slug,
    cityName:  (r.city || r.city_slug).trim(),
    firmCount: r.firm_count,
    avgRating: parseFloat(r.avg_rating) || 0,
  }));

  const html = buildStateHubPage(STATE_TEMPLATES[countryDir].hub, stateCode, cities, countryDir);
  return cacheAndReturn(ctx, cacheKey, htmlResponse(html));
}

// ─── Simple 404 ───────────────────────────────────────────────────────────

function notFoundResponse(countryDir, { cache = true } = {}) {
  const langMap = { au: 'en-AU', us: 'en-US' };
  const lang = langMap[countryDir] || 'en-GB';
  const dir  = countryDir || 'uk';
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Not found | TaxReady</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/svg+xml" href="/assets/taxready-badge.svg">
  <style>
    body{font-family:system-ui,sans-serif;background:#faf9f7;color:#0f0f0e;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
    .wrap{max-width:480px;text-align:center;}
    h1{font-size:24px;margin-bottom:10px;}
    p{color:#6b6b66;margin-bottom:24px;}
    a{display:inline-block;background:#0f0f0e;color:#fff;padding:12px 24px;border-radius:8px;font-weight:600;text-decoration:none;}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Page not found</h1>
    <p>The page you&rsquo;re looking for may have moved or the URL may be incorrect.</p>
    <a href="/${dir}/accounting-firms/">Browse all firms &rarr;</a>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: {
      'Content-Type': 'text/html;charset=utf-8',
      'X-Robots-Tag': 'noindex',
      ...(cache ? {} : { 'Cache-Control': 'no-store' }),
    },
  });
}
