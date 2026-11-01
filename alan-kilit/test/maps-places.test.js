'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_CENTER,
  MAX_RESULTS,
  SEARCH_BIAS_RADIUS_METERS,
  createSearchBounds,
  loadGoogleMaps,
  normalizeCoordinates,
  normalizeNearbyPlaces,
  normalizeGooglePlace,
  normalizeQuery,
  resolveUniqueExactMatch,
  updateSavedPlaceCoordinates
} = require('../assets/maps-places.js');

test('normalizes Google Places names, addresses, and coordinates', () => {
  assert.deepEqual(normalizeGooglePlace({
    id: 'place-id',
    displayName: { text: 'Merkez Camii' },
    formattedAddress: 'Örnek Mahallesi',
    location: { lat: () => 41.1, lng: () => 29.0 }
  }), {
    id: 'place-id',
    name: 'Merkez Camii',
    address: 'Örnek Mahallesi',
    location: { lat: 41.1, lng: 29 }
  });
});

test('rejects unusable places and invalid coordinates', () => {
  assert.equal(normalizeGooglePlace(null), null);
  assert.equal(normalizeGooglePlace({ displayName: 'No location' }), null);
  assert.equal(normalizeGooglePlace({ displayName: 'Bad location', location: { lat: 95, lng: 0 } }), null);
  assert.equal(normalizeGooglePlace({ displayName: '', location: { lat: 1, lng: 1 } }), null);
  assert.equal(normalizeCoordinates({ lat: 0, lng: 181 }), null);
  assert.deepEqual(normalizeCoordinates({ lat: 41, lng: 29 }), { lat: 41, lng: 29 });
});

test('bounds search query size and exposes a capped nearby search policy', () => {
  assert.equal(normalizeQuery('  cami \n yakın   '), 'cami yakın');
  assert.equal(normalizeQuery('x'.repeat(120)).length, 100);
  assert.equal(MAX_RESULTS, 20);
  assert.equal(SEARCH_BIAS_RADIUS_METERS, 10000);
  assert.deepEqual(DEFAULT_CENTER, { lat: 39, lng: 35 });
});

test('normalizes nearby results, removes duplicates and already saved Google places', () => {
  const place = (id, name) => ({
    id,
    displayName: name,
    location: { lat: 41, lng: 29 }
  });
  const results = normalizeNearbyPlaces([
    place('saved', 'Saved'),
    place('one', 'One'),
    place('one', 'Duplicate'),
    place('two', 'Two'),
    null
  ], ['saved']);

  assert.deepEqual(results.map((result) => result.id), ['one', 'two']);

  const capped = normalizeNearbyPlaces(Array.from({ length: 25 }, (_, index) =>
    place('place-' + index, 'Place ' + index)
  ));
  assert.equal(capped.length, MAX_RESULTS);
});

test('only resolves a unique exact place name automatically', () => {
  const place = (id, name, address) => ({
    id,
    name,
    address,
    location: { lat: 41, lng: 29 }
  });
  const exact = place('exact', 'İstanbul Merkez Camii', 'A');
  assert.equal(resolveUniqueExactMatch('Istanbul Merkez Camii', [exact]), exact);
  assert.equal(resolveUniqueExactMatch('Merkez Camii', [exact]), null);
  assert.equal(resolveUniqueExactMatch('Merkez Camii', [
    place('one', 'Merkez Camii', 'A'),
    place('two', 'Merkez Camii', 'B')
  ]), null);
});

test('updating a saved place keeps its record identity and history', () => {
  const saved = {
    id: 'existing-record',
    name: 'Merkez Camii',
    lat: 1,
    lng: 2,
    count: 8,
    history: [{ at: 123, ms: 5000 }],
    inside: true,
    knownInside: true,
    breakUntil: 500
  };
  const updated = updateSavedPlaceCoordinates(saved, {
    id: 'google-place-id',
    location: { lat: 41, lng: 29 }
  });

  assert.equal(updated.id, 'existing-record');
  assert.equal(updated.name, 'Merkez Camii');
  assert.equal(updated.count, 8);
  assert.deepEqual(updated.history, [{ at: 123, ms: 5000 }]);
  assert.deepEqual([updated.lat, updated.lng, updated.googlePlaceId], [41, 29, 'google-place-id']);
  assert.deepEqual([updated.inside, updated.knownInside, updated.breakUntil], [false, false, 0]);
});

test('builds a bounded nearby-search rectangle around the consenting device fix', () => {
  class Bounds {
    constructor(southWest, northEast) {
      this.southWest = southWest;
      this.northEast = northEast;
    }
  }
  const bounds = createSearchBounds(Bounds, { lat: 41, lng: 29 });
  assert.ok(bounds.southWest.lat < 41);
  assert.ok(bounds.northEast.lat > 41);
  assert.ok(bounds.southWest.lng < 29);
  assert.ok(bounds.northEast.lng > 29);
  assert.throws(() => createSearchBounds(Bounds, { lat: 91, lng: 29 }));
});

test('loads the Maps, Places, and bounds libraries needed by place resolution', async () => {
  const originalGoogle = globalThis.google;
  const requestedLibraries = [];
  globalThis.google = {
    maps: {
      importLibrary: async (name) => {
        requestedLibraries.push(name);
        const exportedName = {
          maps: 'Map',
          places: 'Place',
          core: 'LatLngBounds'
        }[name];
        return { [exportedName]: function () {} };
      }
    }
  };

  try {
    const libraries = await loadGoogleMaps('test-key');
    assert.deepEqual(requestedLibraries.sort(), ['core', 'maps', 'places']);
    assert.equal(typeof libraries.Map, 'function');
    assert.equal(typeof libraries.Place, 'function');
    assert.equal(typeof libraries.LatLngBounds, 'function');
  } finally {
    if (originalGoogle === undefined) delete globalThis.google;
    else globalThis.google = originalGoogle;
  }
});
