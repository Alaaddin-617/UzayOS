'use strict';

(function (root) {
  const MAX_RESULTS = 20;
  const SEARCH_BIAS_RADIUS_METERS = 10000;
  const DEFAULT_CENTER = Object.freeze({ lat: 39, lng: 35 });
  let mapsPromise = null;
  let mapsPromiseKey = '';
  let loadedMapsKey = '';

  function importMapsLibraries(key) {
    return Promise.all([
      root.google.maps.importLibrary('maps'),
      root.google.maps.importLibrary('places'),
      root.google.maps.importLibrary('core')
    ]).then(([maps, places, core]) => {
      loadedMapsKey = key;
      return { ...maps, ...places, ...core };
    });
  }

  function normalizeCoordinates(value) {
    if (!value) return null;
    const lat = typeof value.lat === 'function' ? value.lat() : Number(value.lat);
    const lng = typeof value.lng === 'function' ? value.lng() : Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return null;
    }
    return { lat, lng };
  }

  function normalizeGooglePlace(place) {
    if (!place || !place.location) return null;
    const location = normalizeCoordinates(place.location);
    if (!location) return null;

    const rawName = place.displayName;
    const name = typeof rawName === 'string'
      ? rawName
      : String((rawName && rawName.text) || place.name || '').trim();
    if (!name) return null;

    return {
      id: String(place.id || [location.lat, location.lng, name].join(':')),
      name: name.slice(0, 120),
      address: String(place.formattedAddress || '').slice(0, 240),
      location
    };
  }

  function normalizeQuery(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  }

  function normalizeNearbyPlaces(places, existingPlaceIds = []) {
    const existing = new Set((existingPlaceIds || []).map((id) => String(id)));
    const seen = new Set();
    const normalized = [];
    for (const rawPlace of Array.isArray(places) ? places : []) {
      const place = normalizeGooglePlace(rawPlace);
      if (!place || seen.has(place.id) || existing.has(place.id)) continue;
      seen.add(place.id);
      normalized.push(place);
      if (normalized.length >= MAX_RESULTS) break;
    }
    return normalized;
  }

  function resolveUniqueExactMatch(query, places) {
    const normalizeName = (value) => String(value || '')
      .trim()
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    const target = normalizeName(query);
    if (!target || !Array.isArray(places)) return null;
    const exact = places.filter((place) => normalizeName(place && place.name) === target);
    return exact.length === 1 ? exact[0] : null;
  }

  function updateSavedPlaceCoordinates(savedPlace, googlePlace) {
    const location = normalizeCoordinates(googlePlace && googlePlace.location);
    if (!savedPlace || !googlePlace || !googlePlace.id || !location) {
      throw new Error('Google Places sonucu kayıtlı alana bağlanamadı');
    }
    return {
      ...savedPlace,
      lat: location.lat,
      lng: location.lng,
      googlePlaceId: String(googlePlace.id).slice(0, 200),
      inside: false,
      knownInside: false,
      breakUntil: 0
    };
  }

  function createSearchBounds(Bounds, center, radius = SEARCH_BIAS_RADIUS_METERS) {
    const location = normalizeCoordinates(center);
    const meters = Number(radius);
    if (typeof Bounds !== 'function' || !location || !Number.isFinite(meters) || meters <= 0) {
      throw new Error('Google Maps arama sınırı oluşturulamadı');
    }
    const latDelta = meters / 111320;
    const cosLatitude = Math.max(0.01, Math.abs(Math.cos(location.lat * Math.PI / 180)));
    const lngDelta = Math.min(180, meters / (111320 * cosLatitude));
    return new Bounds(
      {
        lat: Math.max(-90, location.lat - latDelta),
        lng: Math.max(-180, location.lng - lngDelta)
      },
      {
        lat: Math.min(90, location.lat + latDelta),
        lng: Math.min(180, location.lng + lngDelta)
      }
    );
  }

  function loadGoogleMaps(apiKey) {
    const key = String(apiKey || '').trim();
    if (!key) return Promise.reject(new Error('Google Maps API anahtarı gerekli'));
    if (root.google && root.google.maps && root.google.maps.importLibrary) {
      if (loadedMapsKey && loadedMapsKey !== key) {
        return Promise.reject(new Error('Google Maps anahtarı değişti. Yeni anahtarı kullanmak için uygulamayı yenile.'));
      }
      return importMapsLibraries(key);
    }
    if (mapsPromise) {
      return mapsPromiseKey === key
        ? mapsPromise
        : Promise.reject(new Error('Google Maps anahtarı değişti. Yeni anahtarı kullanmak için uygulamayı yenile.'));
    }

    mapsPromiseKey = key;
    mapsPromise = new Promise((resolve, reject) => {
      const callbackName = '__alanKilitGoogleMapsReady';
      const script = root.document.createElement('script');
      const timeout = root.setTimeout(() => {
        delete root[callbackName];
        script.remove();
        mapsPromise = null;
        mapsPromiseKey = '';
        reject(new Error('Google Maps yüklenemedi. İnternet ve API anahtarını kontrol et.'));
      }, 20000);

      root[callbackName] = () => {
        root.clearTimeout(timeout);
        delete root[callbackName];
        importMapsLibraries(key).then(
          (libraries) => resolve(libraries),
          (error) => {
            mapsPromise = null;
            mapsPromiseKey = '';
            reject(error);
          }
        );
      };

      script.async = true;
      script.onerror = () => {
        root.clearTimeout(timeout);
        delete root[callbackName];
        script.remove();
        mapsPromise = null;
        mapsPromiseKey = '';
        reject(new Error('Google Maps yüklenemedi. API anahtarını ve internet bağlantısını kontrol et.'));
      };
      script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) +
        '&v=weekly&loading=async&callback=' + callbackName;
      root.document.head.appendChild(script);
    });

    return mapsPromise;
  }

  const api = Object.freeze({
    MAX_RESULTS,
    SEARCH_BIAS_RADIUS_METERS,
    DEFAULT_CENTER,
    normalizeCoordinates,
    normalizeQuery,
    normalizeGooglePlace,
    normalizeNearbyPlaces,
    resolveUniqueExactMatch,
    updateSavedPlaceCoordinates,
    createSearchBounds,
    loadGoogleMaps
  });
  root.AreaMapsPlaces = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(globalThis);
