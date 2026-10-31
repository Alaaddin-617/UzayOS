'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_CENTER,
  MAX_RESULTS,
  SEARCH_BIAS_RADIUS_METERS,
  loadGoogleMaps,
  normalizeCoordinates,
  normalizeGooglePlace,
  normalizeQuery
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

test('loads the Maps, Places, and marker libraries needed by the picker', async () => {
  const originalGoogle = globalThis.google;
  const requestedLibraries = [];
  globalThis.google = {
    maps: {
      importLibrary: async (name) => {
        requestedLibraries.push(name);
        return { [name === 'maps' ? 'Map' : name === 'places' ? 'Place' : 'Marker']: function () {} };
      }
    }
  };

  try {
    const libraries = await loadGoogleMaps('test-key');
    assert.deepEqual(requestedLibraries.sort(), ['maps', 'marker', 'places']);
    assert.equal(typeof libraries.Map, 'function');
    assert.equal(typeof libraries.Place, 'function');
    assert.equal(typeof libraries.Marker, 'function');
  } finally {
    if (originalGoogle === undefined) delete globalThis.google;
    else globalThis.google = originalGoogle;
  }
});
