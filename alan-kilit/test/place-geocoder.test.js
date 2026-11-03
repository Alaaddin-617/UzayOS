'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_RESULTS,
  MAX_CATEGORY_RESULTS,
  MIN_REQUEST_INTERVAL_MS,
  MIN_CATEGORY_REQUEST_INTERVAL_MS,
  CATEGORY_SEARCH_RADIUS_METERS,
  categoryForQuery,
  createNominatimGeocoder,
  normalizeCoordinates,
  normalizeQuery,
  normalizeResults,
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
  assert.equal(categoryForQuery('kendi evim'), null);
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
