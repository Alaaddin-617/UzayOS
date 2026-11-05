'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_RESULTS,
  MAX_CATEGORY_RESULTS,
  MIN_REQUEST_INTERVAL_MS,
  MIN_CATEGORY_REQUEST_INTERVAL_MS,
  CATEGORY_SEARCH_RADIUS_METERS,
  CATEGORY_REQUEST_TIMEOUT_MS,
  EMPTY_CATEGORY_CACHE_TTL_MS,
  categoryForQuery,
  createNominatimGeocoder,
  normalizeCoordinates,
  normalizeQuery,
  normalizeResults,
  mergeCategoryMembers,
  resolveUniqueExactMatch,
  updateSavedPlaceCoordinates
} = require('../assets/place-geocoder.js');

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) || null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function nominatimResult(osmId, name, address, lat = '41.1', lon = '29.0') {
  return {
    osm_type: 'way',
    osm_id: osmId,
    name,
    display_name: address,
    lat,
    lon
  };
}

test('normalizes query and Nominatim results while rejecting invalid coordinates', () => {
  assert.equal(normalizeQuery('  Merkez \n Camii '), 'Merkez Camii');
  assert.equal(normalizeQuery('x'.repeat(150)).length, 120);
  assert.equal(normalizeCoordinates({ lat: '41', lng: '29' }).lat, 41);
  assert.equal(normalizeCoordinates({ lat: 91, lng: 29 }), null);
  assert.deepEqual(normalizeResults([
    nominatimResult(12, 'Merkez Camii', 'Merkez Camii, İstanbul'),
    nominatimResult(12, 'Duplicate', 'Duplicate, İstanbul'),
    nominatimResult(13, 'Invalid', 'Invalid, İstanbul', 'NaN')
  ]), [{
    id: 'way:12',
    name: 'Merkez Camii',
    address: 'Merkez Camii, İstanbul',
    location: { lat: 41.1, lng: 29 }
  }]);
});

test('only resolves one exact name and leaves ambiguous results for user confirmation', () => {
  const exact = { id: 'way:1', name: 'İstanbul Merkez Camii', address: 'A' };
  assert.equal(resolveUniqueExactMatch('Istanbul Merkez Camii', [exact]), exact);
  assert.equal(resolveUniqueExactMatch('Merkez Camii', [exact]), null);
  assert.equal(resolveUniqueExactMatch('Merkez Camii', [
    { id: 'way:2', name: 'Merkez Camii', address: 'A' },
    { id: 'way:3', name: 'Merkez Camii', address: 'B' }
  ]), null);
});

test('recognizes supported place categories from Turkish names', () => {
  assert.equal(categoryForQuery('Cami')[0], 'mosque');
  assert.equal(categoryForQuery('yakındaki okullar')[0], 'school');
  assert.equal(categoryForQuery('Eczane')[0], 'pharmacy');
  assert.equal(categoryForQuery('Market')[0], 'supermarket');
  assert.equal(categoryForQuery('Mağaza')[0], 'shop');
  assert.equal(categoryForQuery('Park')[0], 'park');
  assert.equal(categoryForQuery('AVM')[0], 'shopping_centre');
  assert.equal(categoryForQuery('kendi evim'), null);
});

test('combines all returned category places into one deduplicated rule member list', () => {
  const initial = mergeCategoryMembers([], [
    { id: 'node:1', name: 'Birinci', location: { lat: 41, lng: 29 } },
    { id: 'node:2', name: 'İkinci', location: { lat: 41.1, lng: 29.1 } }
  ]);
  const updated = mergeCategoryMembers(initial, [
    { id: 'node:2', name: 'İkinci duplicate', location: { lat: 41.1, lng: 29.1 } },
    { id: 'way:3', name: 'Üçüncü', location: { lat: 41.2, lng: 29.2 } }
  ]);
  assert.equal(updated.length, 3);
  assert.deepEqual(updated.map((member) => member.geocodeId), ['node:1', 'node:2', 'way:3']);
  assert.equal(mergeCategoryMembers(updated, [], 2).length, 2);
});

test('saved coordinate updates preserve record identity and history', () => {
  const saved = {
    id: 'existing-record',
    name: 'Merkez Camii',
    count: 8,
    history: [{ at: 123, ms: 5000 }],
    inside: true,
    knownInside: true,
    breakUntil: 500
  };
  const updated = updateSavedPlaceCoordinates(saved, {
    id: 'way:45',
    location: { lat: 41, lng: 29 }
  });

  assert.equal(updated.id, 'existing-record');
  assert.equal(updated.name, 'Merkez Camii');
  assert.equal(updated.count, 8);
  assert.deepEqual(updated.history, [{ at: 123, ms: 5000 }]);
  assert.deepEqual([updated.lat, updated.lng, updated.geocodeId], [41, 29, 'way:45']);
  assert.deepEqual([updated.inside, updated.knownInside, updated.breakUntil], [false, false, 0]);
});

test('search is user-triggered, sends only the name, and caches the result', async () => {
  const storage = new MemoryStorage();
  const calls = [];
  const geocoder = createNominatimGeocoder({
    storage,
    now: () => 10000,
    wait: async () => {},
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return { ok: true, json: async () => [nominatimResult(7, 'Okul', 'Okul, Ankara')] };
    }
  });

  const first = await geocoder.search('  Okul ');
  const second = await geocoder.search('Okul');
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get('q'), 'Okul');
  assert.equal(calls[0].url.searchParams.get('limit'), String(MAX_RESULTS));
  assert.equal(calls[0].url.searchParams.has('lat'), false);
  assert.equal(calls[0].url.searchParams.has('lon'), false);
  assert.equal(calls[0].url.searchParams.has('key'), false);
  assert.equal(calls[0].options.referrerPolicy, 'strict-origin-when-cross-origin');
});

test('works without an API key and clearly rejects offline name searches', async () => {
  let fetchCount = 0;
  const geocoder = createNominatimGeocoder({
    storage: new MemoryStorage(),
    now: () => 100000,
    fetchImpl: async (url) => {
      fetchCount++;
      assert.equal(new URL(url).searchParams.has('key'), false);
      throw new TypeError('Failed to fetch');
    }
  });

  await assert.rejects(geocoder.search('Merkez Camii'), /Failed to fetch/);
  assert.equal(fetchCount, 1);
});

test('reads the search provider URL at request time so the service can be switched remotely', async () => {
  const endpoints = [];
  let endpoint = 'https://nominatim.openstreetmap.org/search';
  const geocoder = createNominatimGeocoder({
    storage: new MemoryStorage(),
    now: () => 100000,
    wait: async () => {},
    getServiceConfig: async () => ({
      nominatimEndpoint: endpoint,
      overpassEndpoint: 'https://overpass-api.de/api/interpreter',
      placeProviderName: 'OpenStreetMap Nominatim',
      categoryProviderName: 'OpenStreetMap Overpass'
    }),
    fetchImpl: async (url) => {
      endpoints.push(new URL(url).hostname);
      return { ok: true, json: async () => [] };
    }
  });

  const config = await geocoder.getServiceConfig();
  assert.equal(config.placeProviderName, 'OpenStreetMap Nominatim');
  await geocoder.search('Yer A', config);
  endpoint = 'https://geocoder.example/search';
  await geocoder.search('Yer B', await geocoder.getServiceConfig());
  assert.deepEqual(endpoints, ['nominatim.openstreetmap.org', 'geocoder.example']);
});

test('removes old Google key UI and clears a previously stored browser key', () => {
  const appSource = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../assets/app.js'),
    'utf8'
  );
  const html = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../index.html'),
    'utf8'
  );
  assert.match(appSource, /localStorage\.removeItem\('alanKilit\.googleMapsApiKey\.v1'\)/);
  assert.doesNotMatch(html, /googleMapsApiKey|saveMapsApiKey|Google Maps API anahtarı/);
  assert.doesNotMatch(appSource, /maps\.googleapis\.com/);
});

test('serializes uncached requests to respect public service rate limit', async () => {
  const storage = new MemoryStorage();
  let time = 100000;
  const waits = [];
  const geocoder = createNominatimGeocoder({
    storage,
    now: () => time,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
      time += milliseconds;
    },
    fetchImpl: async () => ({ ok: true, json: async () => [] })
  });

  await Promise.all([geocoder.search('Okul A'), geocoder.search('Okul B')]);
  assert.equal(waits.length, 1);
  assert.ok(waits[0] >= MIN_REQUEST_INTERVAL_MS);
});

test('category search sends the consented location to Overpass and normalizes point/area results', async () => {
  const storage = new MemoryStorage();
  const calls = [];
  const geocoder = createNominatimGeocoder({
    storage,
    now: () => 100000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          elements: [
            {
              type: 'node',
              id: 21,
              lat: 41.1,
              lon: 29.0,
              tags: { name: 'Merkez Camii' }
            },
            {
              type: 'way',
              id: 22,
              center: { lat: 41.2, lon: 29.1 },
              tags: { 'name:tr': 'Yeni Cami', 'addr:city': 'İstanbul' }
            }
          ]
        })
      };
    }
  });

  const result = await geocoder.searchCategory('Cami', { lat: 41.12356, lng: 29.09876 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://overpass-api.de/api/interpreter');
  assert.equal(calls[0].options.method, 'POST');
  const query = new URLSearchParams(calls[0].options.body).get('data');
  assert.ok(query.includes('around:' + CATEGORY_SEARCH_RADIUS_METERS + ',41.124,29.099'));
  assert.ok(query.includes('["religion"="muslim"]'));
  assert.equal(result.capped, false);
  assert.deepEqual(result.places.map((place) => place.id), ['node:21', 'way:22']);
  assert.deepEqual(result.places[1].location, { lat: 41.2, lng: 29.1 });
  assert.equal(result.places[1].address, 'İstanbul');
});

test('maps school, market/shop, and park terms to their OSM category tags', async () => {
  const queries = [];
  let time = 100000;
  const geocoder = createNominatimGeocoder({
    storage: new MemoryStorage(),
    now: () => {
      time += MIN_CATEGORY_REQUEST_INTERVAL_MS;
      return time;
    },
    fetchImpl: async (url, options) => {
      queries.push(new URLSearchParams(options.body).get('data'));
      return { ok: true, json: async () => ({ elements: [] }) };
    }
  });

  for (const term of ['Okul', 'Market', 'Mağaza', 'Park']) {
    await geocoder.searchCategory(term, { lat: 41, lng: 29 });
  }
  assert.ok(queries[0].includes('["amenity"="school"]'));
  assert.ok(queries[1].includes('["shop"="supermarket"]'));
  assert.ok(queries[2].includes('["shop"]'));
  assert.ok(queries[3].includes('["leisure"="park"]'));
});

test('category searches fall back after timeout for all primary supported categories', async () => {
  const terms = ['Cami', 'Okul', 'Market', 'Mağaza', 'Park', 'Restoran'];
  for (const [index, term] of terms.entries()) {
    const calls = [];
    const geocoder = createNominatimGeocoder({
      storage: new MemoryStorage(),
      now: () => 100000,
      wait: async () => {},
      getServiceConfig: async () => ({
        overpassEndpoints: [
          'https://primary.example/api/interpreter',
          'https://fallback.example/api/interpreter'
        ]
      }),
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        if (new URL(url).hostname === 'primary.example') {
          const error = new Error('request timeout');
          error.name = 'AbortError';
          throw error;
        }
        return {
          ok: true,
          json: async () => ({
            elements: [{
              type: 'node',
              id: index + 100,
              lat: 41.1,
              lon: 29,
              tags: { name: term + ' sonucu' }
            }]
          })
        };
      }
    });

    const result = await geocoder.searchCategory(term, {
      lat: 41 + index / 100,
      lng: 29
    });
    assert.deepEqual(calls.map(({ url }) => new URL(url).hostname), [
      'primary.example',
      'fallback.example'
    ]);
    assert.equal(result.places.length, 1, term);
    assert.equal(
      new URLSearchParams(calls[0].options.body).get('data').includes('[out:json][timeout:15]'),
      true
    );
  }
  assert.equal(CATEGORY_REQUEST_TIMEOUT_MS, 18000);
});

test('category searches fall back when Overpass returns a remark', async () => {
  const calls = [];
  const geocoder = createNominatimGeocoder({
    storage: new MemoryStorage(),
    now: () => 100000,
    wait: async () => {},
    getServiceConfig: async () => ({
      overpassEndpoints: [
        'https://primary.example/api/interpreter',
        'https://fallback.example/api/interpreter'
      ]
    }),
    fetchImpl: async (url) => {
      calls.push(new URL(url).hostname);
      return {
        ok: true,
        json: async () => calls.length === 1
          ? { remark: 'runtime error: query timed out', elements: [] }
          : {
              elements: [{
                type: 'node',
                id: 33,
                lat: 41.1,
                lon: 29,
                tags: { name: 'Yedek sonuç' }
              }]
            }
      };
    }
  });

  const result = await geocoder.searchCategory('Restoran', { lat: 41, lng: 29 });
  assert.deepEqual(calls, ['primary.example', 'fallback.example']);
  assert.equal(result.places[0].name, 'Yedek sonuç');
});

test('category searches cache empty results briefly without turning them into saved places', async () => {
  const terms = ['Cami', 'Okul', 'Market', 'Mağaza', 'Park', 'Restoran'];
  for (const term of terms) {
    let requests = 0;
    const geocoder = createNominatimGeocoder({
      storage: new MemoryStorage(),
      now: () => 100000,
      wait: async () => {},
      fetchImpl: async () => {
        requests++;
        return { ok: true, json: async () => ({ elements: [] }) };
      }
    });

    const first = await geocoder.searchCategory(term, { lat: 41, lng: 29 });
    const second = await geocoder.searchCategory(term, { lat: 41, lng: 29 });
    assert.deepEqual(first, { places: [], capped: false }, term);
    assert.deepEqual(second, first, term);
    assert.equal(requests, 1, term);
  }
  assert.equal(EMPTY_CATEGORY_CACHE_TTL_MS, 60000);
});

test('empty category results return before the app persists a category rule', () => {
  const appSource = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../assets/app.js'),
    'utf8'
  );
  const categoryBranch = appSource.slice(
    appSource.indexOf('if (category) {', appSource.indexOf('async function resolvePlaceName')),
    appSource.indexOf('\n    const places = await placeGeocoder.search(query', appSource.indexOf('async function resolvePlaceName'))
  );
  const noResultsGuard = categoryBranch.indexOf('if (!result.places.length)');
  const saveCall = categoryBranch.indexOf('saveResolvedCategoryPlaces(');

  assert.ok(noResultsGuard >= 0);
  assert.ok(saveCall > noResultsGuard);
  assert.match(categoryBranch.slice(noResultsGuard, saveCall), /return;/);
});

test('category query caps results and rejects a missing location before network access', async () => {
  let fetchCount = 0;
  const geocoder = createNominatimGeocoder({
    storage: new MemoryStorage(),
    now: () => 100000,
    fetchImpl: async () => {
      fetchCount++;
      return {
        ok: true,
        json: async () => ({
          elements: Array.from({ length: MAX_CATEGORY_RESULTS + 1 }, (_, index) => ({
            type: 'node',
            id: index + 1,
            lat: 41,
            lon: 29,
            tags: { name: 'Cami ' + index }
          }))
        })
      };
    }
  });

  await assert.rejects(geocoder.searchCategory('Cami'), /geçerli cihaz konumu/);
  const result = await geocoder.searchCategory('Cami', { lat: 41, lng: 29 });
  assert.equal(fetchCount, 1);
  assert.equal(result.places.length, MAX_CATEGORY_RESULTS);
  assert.equal(result.capped, true);
  assert.equal(MIN_CATEGORY_REQUEST_INTERVAL_MS, 10000);
});

test('serializes category requests to reduce load on the public data service', async () => {
  const storage = new MemoryStorage();
  let time = 100000;
  const waits = [];
  let requests = 0;
  const geocoder = createNominatimGeocoder({
    storage,
    now: () => time,
    wait: async (milliseconds) => {
      waits.push(milliseconds);
      time += milliseconds;
    },
    fetchImpl: async () => {
      requests++;
      return { ok: true, json: async () => ({ elements: [] }) };
    }
  });

  await Promise.all([
    geocoder.searchCategory('Cami', { lat: 41, lng: 29 }),
    geocoder.searchCategory('Okul', { lat: 41, lng: 29 })
  ]);
  assert.equal(requests, 2);
  assert.deepEqual(waits, [MIN_CATEGORY_REQUEST_INTERVAL_MS]);
});

test('surfaces provider errors instead of saving empty or incorrect coordinates', async () => {
  const geocoder = createNominatimGeocoder({
    storage: new MemoryStorage(),
    now: () => 10000,
    fetchImpl: async () => ({ ok: false, status: 429 })
  });

  await assert.rejects(geocoder.search('Merkez Camii'), /yanıt vermedi \(429\)/);
  const invalidResponseGeocoder = createNominatimGeocoder({
    storage: new MemoryStorage(),
    now: () => 10000,
    fetchImpl: async () => ({ ok: true, json: async () => ({ error: 'temporary failure' }) })
  });
  await assert.rejects(invalidResponseGeocoder.search('Merkez Camii'), /geçersiz yanıt/);

  const partialCategoryGeocoder = createNominatimGeocoder({
    storage: new MemoryStorage(),
    now: () => 10000,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ remark: 'runtime error: query timed out', elements: [] })
    })
  });
  await assert.rejects(
    partialCategoryGeocoder.searchCategory('Cami', { lat: 41, lng: 29 }),
    /tamamlanamadı/
  );
  assert.throws(() => updateSavedPlaceCoordinates({}, {
    id: 'bad',
    location: { lat: 91, lng: 29 }
  }));
});

test('backs off after provider rate limiting and gives a clear retry delay', async () => {
  const storage = new MemoryStorage();
  let time = 100000;
  let requests = 0;
  const geocoder = createNominatimGeocoder({
    storage,
    now: () => time,
    wait: async (milliseconds) => {
      time += milliseconds;
    },
    fetchImpl: async () => {
      requests++;
      return {
        ok: false,
        status: 429,
        headers: { get: (name) => name === 'Retry-After' ? '45' : null }
      };
    }
  });

  await assert.rejects(geocoder.search('Kafe'), /yanıt vermedi \(429\)/);
  await assert.rejects(geocoder.search('Kafe'), /45 saniye sonra yeniden dene/);
  assert.equal(requests, 1);
});

test('Overpass Retry-After backoff is isolated per endpoint and honored', async () => {
  const storage = new MemoryStorage();
  let time = 100000;
  const endpoints = [];
  const geocoder = createNominatimGeocoder({
    storage,
    now: () => time,
    wait: async (milliseconds) => {
      time += milliseconds;
    },
    getServiceConfig: async () => ({
      overpassEndpoints: [
        'https://busy.example/api/interpreter',
        'https://available.example/api/interpreter'
      ]
    }),
    fetchImpl: async (url) => {
      const host = new URL(url).hostname;
      endpoints.push(host);
      if (host === 'busy.example') {
        return {
          ok: false,
          status: 429,
          headers: { get: (name) => name === 'Retry-After' ? '45' : null }
        };
      }
      return { ok: true, json: async () => ({ elements: [] }) };
    }
  });

  await geocoder.searchCategory('Cami', { lat: 41, lng: 29 });
  await geocoder.searchCategory('Okul', { lat: 41.1, lng: 29 });
  assert.deepEqual(endpoints, [
    'busy.example',
    'available.example',
    'available.example'
  ]);
});
