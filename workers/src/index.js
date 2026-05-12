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

import PROFILE_TEMPLATE from '../../accountant-profile-template.html';
import CITY_TEMPLATE    from '../../city-template.html';
import { buildFirmProfile, buildCityPage, slugify } from './render.js';

// Total firm count shown in {{TOTAL_FIRM_COUNT}} — update when the CSV grows significantly
const TOTAL_FIRM_COUNT = 5153;
// Minimum firms per city to show a city hub — 1 allows small suburb pages to render
const MIN_FIRMS_FOR_CITY   = 1;
// Minimum firms to appear as a "nearby city" chip on other city hub pages
const MIN_FIRMS_FOR_NEARBY = 3;

// Nearby cities cache: computed once per Worker instance to avoid repeated DB queries
let _nearbyCitiesCache = null;

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

    // ── Firm profile: /uk/accounting-firms/{city}/{firm}/ ─────────────────
    const firmMatch = path.match(/^\/(uk|au)\/accounting-firms\/([^/]+)\/([^/]+)\/?$/);
    if (firmMatch) {
      const [, , citySlug, firmSlug] = firmMatch;
      return handleFirmProfile(env, citySlug, firmSlug, request);
    }

    // ── City hub: /uk/accounting-firms/{city}/ ────────────────────────────
    const cityMatch = path.match(/^\/(uk|au)\/accounting-firms\/([^/]+)\/?$/);
    if (cityMatch) {
      const [, countryDir, citySlug] = cityMatch;
      return handleCityHub(env, countryDir, citySlug, request);
    }

    // ── Firm data lookup for claim form pre-fill ──────────────────────────
    if (path === '/api/firm') return handleFirmGet(env, url);

    // ── Everything else: pass through to GitHub Pages origin ──────────────
    return fetch(request);
  },
};

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleEnquiry(request, env) {
  let body;
  try { body = await request.json(); } catch { return new Response('Bad request', { status: 400 }); }

  const { name, email, phone, message, firm_name, source,
          biz_structure, tier, income, notes, trade } = body;

  const dbMessage = message || [biz_structure, tier, notes].filter(Boolean).join(' | ');

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
                             firm_name: firm_name || '', source: source || 'unknown' }),
    }).catch(() => {}),

    fetch(env.ZAPIER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, timestamp: new Date().toISOString() }),
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

  const tasks = [
    fetch(`${env.SUPABASE_URL}/rest/v1/accounting_firms?on_conflict=email`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        env.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + env.SUPABASE_ANON_KEY,
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ ...payload, updated_at: ts }),
    }).catch(() => {}),
  ];

  if (trigger_zapier) {
    tasks.push(
      fetch(env.CLAIM_ZAPIER_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, timestamp: ts }),
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

async function handleFirmProfile(env, citySlug, firmSlug, request) {
  const cache    = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached   = await cache.match(cacheKey);
  if (cached) return cached;

  // Look up firm: match on city_slug+firm_slug OR on 'other' city with suburb_slug match
  const result = await env.DB.prepare(
    `SELECT * FROM firms
     WHERE firm_slug = ?
       AND (city_slug = ? OR (city_slug = 'other' AND suburb_slug = ?))
     LIMIT 1`
  ).bind(firmSlug, citySlug, citySlug).first();

  if (!result) {
    return notFoundResponse(citySlug);
  }

  const html = buildFirmProfile(PROFILE_TEMPLATE, result, TOTAL_FIRM_COUNT);
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

  const country = countryDir === 'au' ? 'AU' : 'GB';

  // Fetch all firms for this city (including suburb_slug-based lookups for 'other')
  const { results: firms } = await env.DB.prepare(
    `SELECT * FROM firms
     WHERE (city_slug = ? OR (city_slug = 'other' AND suburb_slug = ?))
       AND country = ?`
  ).bind(citySlug, citySlug, country).all();

  if (!firms || firms.length < MIN_FIRMS_FOR_CITY) {
    return notFoundResponse(citySlug);
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
  if (!_nearbyCitiesCache) {
    // One DB round-trip per Worker instance to get all city centroids
    const { results } = await env.DB.prepare(
      `SELECT city_slug, AVG(latitude) AS avg_lat, AVG(longitude) AS avg_lng, COUNT(*) AS firm_count,
              MAX(city) AS city_name
       FROM firms
       WHERE country = ? AND city_slug != 'other' AND latitude IS NOT NULL AND longitude IS NOT NULL
       GROUP BY city_slug
       HAVING COUNT(*) >= ?`
    ).bind(country, MIN_FIRMS_FOR_NEARBY).all();
    _nearbyCitiesCache = results || [];
  }

  // Average centroid for the current city
  const validFirms = currentFirms.filter(f => f.latitude && f.longitude);
  if (!validFirms.length) return [];
  const curLat = validFirms.reduce((s, f) => s + f.latitude, 0) / validFirms.length;
  const curLng = validFirms.reduce((s, f) => s + f.longitude, 0) / validFirms.length;

  // Euclidean distance (fine for UK/AU scale comparisons)
  const sorted = _nearbyCitiesCache
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

// ─── Simple 404 ───────────────────────────────────────────────────────────

function notFoundResponse(slug) {
  const name = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const html = `<!DOCTYPE html>
<html lang="en-GB">
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
    <p>We couldn&rsquo;t find &ldquo;${name}&rdquo;. It may have moved or the URL may be incorrect.</p>
    <a href="/uk/accounting-firms/">Browse all firms &rarr;</a>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}
