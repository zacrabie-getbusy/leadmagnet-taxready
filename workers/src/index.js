/**
 * TaxReady Cloudflare Worker
 *
 * Intercepts /uk/accounting-firms/* and /au/accounting-firms/* paths and
 * serves server-rendered HTML from Cloudflare D1. All other requests pass
 * through to the GitHub Pages origin unchanged.
 *
 * Routes configured in wrangler.toml:
 *   taxready.me/uk/accounting-firms/*
 *   taxready.me/au/accounting-firms/*
 */

import PROFILE_TEMPLATE     from '../../accountant-profile-template.html';
import CITY_TEMPLATE         from '../../city-template.html';
import STATE_INDEX_TEMPLATE  from '../../us-state-index-template.html';
import STATE_HUB_TEMPLATE    from '../../us-state-hub-template.html';
import { buildFirmProfile, buildCityPage, buildStateIndexPage, buildStateHubPage, STATE_CODES, STATE_NAME, slugify } from './render.js';

// Total firm count shown in {{TOTAL_FIRM_COUNT}} — update when the CSV grows significantly
const TOTAL_FIRM_COUNT = 5153;
// Minimum firms per city to show a city hub — 1 allows small suburb pages to render
const MIN_FIRMS_FOR_CITY   = 1;
// Minimum firms to appear as a "nearby city" chip on other city hub pages
const MIN_FIRMS_FOR_NEARBY = 3;

// Nearby cities cache: keyed by country code to avoid cross-country bleed
let _nearbyCitiesCache = {};

// Per-country firm count cache — populated lazily, one DB query per country per instance
let _firmCountCache = {};
async function getCountryFirmCount(env, country) {
  if (!_firmCountCache[country]) {
    const row = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM firms WHERE country = ?').bind(country).first();
    _firmCountCache[country] = row ? row.cnt : 0;
  }
  return _firmCountCache[country];
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

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

    // ── Legacy URL redirects (pre-/uk/ paths from old GitHub Pages build) ──
    // Old static files lived at /accounting-firms/{city}/{firm}.html and
    // /accounting-firms/{city}/{firm}/. Google still has thousands of these
    // indexed — 301 them to the canonical /uk/ equivalents so link equity
    // is preserved rather than lost to a 404.
    const legacyFirm = path.match(/^\/accounting-firms\/([^/]+)\/([^/]+?)(?:\.html)?\/?$/);
    if (legacyFirm) {
      return Response.redirect(`https://taxready.me/uk/accounting-firms/${legacyFirm[1]}/${legacyFirm[2]}/`, 301);
    }
    const legacyCity = path.match(/^\/accounting-firms\/([^/]+)\/?$/);
    if (legacyCity) {
      return Response.redirect(`https://taxready.me/uk/accounting-firms/${legacyCity[1]}/`, 301);
    }

    // ── Trailing-slash normalisation ─────────────────────────────────────
    // Canonical form is with trailing slash (matches sitemap). Redirect the
    // no-slash form so ranking signals consolidate on one URL.
    const firmNoSlash = /^\/(uk|au|us)\/accounting-firms\/[^/]+\/[^/]+$/.test(path);
    const cityNoSlash = /^\/(uk|au|us)\/accounting-firms\/[^/]+$/.test(path);
    if (firmNoSlash || cityNoSlash) {
      return Response.redirect(request.url + '/', 301);
    }

    // ── US state index: /us/accounting-firms/ ────────────────────────────
    if (path === '/us/accounting-firms/' || path === '/us/accounting-firms') {
      return handleUSStateIndex(env, request);
    }

    // ── Firm profile: /{uk|au|us}/accounting-firms/{city}/{firm}/ ─────────
    const firmMatch = path.match(/^\/(uk|au|us)\/accounting-firms\/([^/]+)\/([^/]+)\/?$/);
    if (firmMatch) {
      const [, countryDir, citySlug, firmSlug] = firmMatch;
      return handleFirmProfile(env, countryDir, citySlug, firmSlug, request);
    }

    // ── City hub / US state hub: /{uk|au|us}/accounting-firms/{slug}/ ────
    const cityMatch = path.match(/^\/(uk|au|us)\/accounting-firms\/([^/]+)\/?$/);
    if (cityMatch) {
      const [, countryDir, slug] = cityMatch;
      if (countryDir === 'us' && STATE_CODES.has(slug)) {
        return handleUSStateHub(env, slug, request);
      }
      return handleCityHub(env, countryDir, slug, request);
    }

    // ── Firm data lookup for claim form pre-fill ──────────────────────────
    if (path === '/api/firm') return handleFirmGet(env, url);

    // ── All firms JSON feed for find-accountant page ───────────────────────
    if (path === '/api/firms') return handleFirmsApi(env, url);

    // ── Everything else: pass through to GitHub Pages origin ──────────────
    return fetch(request);
  },
};

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
          biz_structure, tier, income, notes, trade } = body;

  const dbMessage = message || [biz_structure, tier, notes].filter(Boolean).join(' | ');
  const country = countryFromReferer(request);

  await Promise.all([
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
    }).catch(() => {}),

    fetch(env.ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, country, timestamp: new Date().toISOString() }),
    }).catch(() => {}),
  ]);

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

  if (!res || !res.ok) return new Response('null', { headers: { 'Content-Type': 'application/json' } });
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
    }).catch(() => {}),
  ];

  if (trigger_zapier) {
    tasks.push(
      fetch(env.CLAIM_ZAPIER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, country, timestamp: ts }),
      }).catch(() => {})
    );
  }

  await Promise.all(tasks);
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

async function handleFirmProfile(env, countryDir, citySlug, firmSlug, request) {
  const cache    = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached   = await cache.match(cacheKey);
  if (cached) return cached;

  const country = countryDir === 'au' ? 'AU' : countryDir === 'us' ? 'US' : 'GB';

  // Look up firm: match on city_slug+firm_slug OR on 'other' city with suburb_slug match.
  // Country filter prevents a US firm from being served at a /uk/ URL.
  const result = await env.DB.prepare(
    `SELECT * FROM firms
     WHERE firm_slug = ?
       AND (city_slug = ? OR (city_slug = 'other' AND suburb_slug = ?))
       AND country = ?
     LIMIT 1`
  ).bind(firmSlug, citySlug, citySlug, country).first();

  if (!result) {
    return notFoundResponse(countryDir);
  }

  const countryFirmCount = await getCountryFirmCount(env, result.country || 'GB');
  const html = buildFirmProfile(PROFILE_TEMPLATE, result, countryFirmCount);
  const response = new Response(html, {
    status: 200,
    headers: {
      'Content-Type':  'text/html;charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

async function handleCityHub(env, countryDir, citySlug, request) {
  const cache    = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached   = await cache.match(cacheKey);
  if (cached) return cached;

  const country = countryDir === 'au' ? 'AU' : countryDir === 'us' ? 'US' : 'GB';

  // Fetch all firms for this city (including suburb_slug-based lookups for 'other')
  const { results: firms } = await env.DB.prepare(
    `SELECT * FROM firms
     WHERE (city_slug = ? OR (city_slug = 'other' AND suburb_slug = ?))
       AND country = ?`
  ).bind(citySlug, citySlug, country).all();

  if (!firms || firms.length < MIN_FIRMS_FOR_CITY) {
    return notFoundResponse(countryDir);
  }

  const nearby = await getNearbyCities(env, citySlug, country, firms);
  const html   = buildCityPage(CITY_TEMPLATE, countryDir, citySlug, firms, nearby);
  const response = new Response(html, {
    status: 200,
    headers: {
      'Content-Type':  'text/html;charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

// ─── Nearby cities (geographic) ───────────────────────────────────────────

async function getNearbyCities(env, currentSlug, country, currentFirms) {
  if (!_nearbyCitiesCache[country]) {
    // One DB round-trip per Worker instance per country to get city centroids
    const { results } = await env.DB.prepare(
      `SELECT city_slug, AVG(latitude) AS avg_lat, AVG(longitude) AS avg_lng, COUNT(*) AS firm_count,
              MAX(city) AS city_name
       FROM firms
       WHERE country = ? AND city_slug != 'other' AND latitude IS NOT NULL AND longitude IS NOT NULL
       GROUP BY city_slug
       HAVING COUNT(*) >= ?`
    ).bind(country, MIN_FIRMS_FOR_NEARBY).all();
    _nearbyCitiesCache[country] = results || [];
  }

  // Average centroid for the current city
  const validFirms = currentFirms.filter(f => f.latitude && f.longitude);
  if (!validFirms.length) return [];
  const curLat = validFirms.reduce((s, f) => s + f.latitude, 0) / validFirms.length;
  const curLng = validFirms.reduce((s, f) => s + f.longitude, 0) / validFirms.length;

  // Euclidean distance (fine for UK/AU/US scale comparisons)
  const sorted = _nearbyCitiesCache[country]
    .filter(c => c.city_slug !== currentSlug)
    .map(c => ({
      ...c,
      dist: Math.hypot(c.avg_lat - curLat, c.avg_lng - curLng),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 8);

  return sorted.map(c => ({
    citySlug: c.city_slug,
    cityName: (c.city_name || '').trim() || c.city_slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
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

// ─── US State index ───────────────────────────────────────────────────────

async function handleUSStateIndex(env, request) {
  const cache    = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached   = await cache.match(cacheKey);
  if (cached) return cached;

  const { results } = await env.DB.prepare(
    `SELECT suburb_slug, COUNT(*) AS firm_count, AVG(rating) AS avg_rating
     FROM firms WHERE country = 'US' AND suburb_slug != ''
     GROUP BY suburb_slug ORDER BY firm_count DESC`
  ).all();

  const states = (results || []).map(r => ({
    stateCode: r.suburb_slug,
    stateName: STATE_NAME[r.suburb_slug] || r.suburb_slug.toUpperCase(),
    firmCount: r.firm_count,
    avgRating: parseFloat(r.avg_rating) || 0,
  }));

  const html = buildStateIndexPage(STATE_INDEX_TEMPLATE, states);
  const response = new Response(html, {
    status: 200,
    headers: {
      'Content-Type':  'text/html;charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

// ─── US State hub ──────────────────────────────────────────────────────────

async function handleUSStateHub(env, stateCode, request) {
  const cache    = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached   = await cache.match(cacheKey);
  if (cached) return cached;

  const { results } = await env.DB.prepare(
    `SELECT city_slug, city, COUNT(*) AS firm_count, AVG(rating) AS avg_rating
     FROM firms WHERE country = 'US' AND suburb_slug = ?
     GROUP BY city_slug, city ORDER BY firm_count DESC`
  ).bind(stateCode).all();

  if (!results || results.length === 0) {
    return notFoundResponse('us');
  }

  const cities = results.map(r => ({
    citySlug:  r.city_slug,
    cityName:  (r.city || r.city_slug).trim(),
    firmCount: r.firm_count,
    avgRating: parseFloat(r.avg_rating) || 0,
  }));

  const html = buildStateHubPage(STATE_HUB_TEMPLATE, stateCode, cities);
  const response = new Response(html, {
    status: 200,
    headers: {
      'Content-Type':  'text/html;charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}

// ─── Simple 404 ───────────────────────────────────────────────────────────

function notFoundResponse(countryDir) {
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
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}
