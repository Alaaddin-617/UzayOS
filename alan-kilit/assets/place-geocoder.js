'use strict';

(function (root) {
  const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
  const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
  const SERVICE_CONFIG_FILE = './place-search-config.json';
  const CACHE_KEY = 'alanKilit.placeGeocoder.cache.v1';
  const LAST_REQUEST_KEY = 'alanKilit.placeGeocoder.lastRequest.v1';
  const LAST_CATEGORY_REQUEST_KEY = 'alanKilit.placeGeocoder.lastCategoryRequest.v1';
  const BACKOFF_PREFIX = 'alanKilit.placeGeocoder.backoff.v1.';
  const MAX_RESULTS = 5;
  const MAX_CATEGORY_RESULTS = 100;
  const MAX_CACHE_ENTRIES = 100;
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const EMPTY_CACHE_TTL_MS = 60 * 60 * 1000;
  const MIN_REQUEST_INTERVAL_MS = 1100;
  const MIN_CATEGORY_REQUEST_INTERVAL_MS = 10000;
  const CATEGORY_SEARCH_RADIUS_METERS = 10000;
  const CATEGORY_CACHE_TTL_MS = 5 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 30000;
  const CATEGORIES = Object.freeze({
    mosque: {
      label: 'Cami',
      aliases: ['cami', 'camii', 'camiler', 'mosque', 'mosques'],
      selectors: [
        ['amenity', 'place_of_worship', 'religion', 'muslim'],
        ['amenity', 'mosque'],
        ['building', 'mosque']
      ]
    },
    school: {
      label: 'Okul',
      aliases: ['okul', 'okulu', 'okullar', 'school', 'schools'],
      selectors: [['amenity', 'school'], ['building', 'school']]
    },
    hospital: {
      label: 'Hastane',
      aliases: ['hastane', 'hastanesi', 'hastaneler', 'hospital', 'hospitals'],
      selectors: [['amenity', 'hospital']]
    },
    university: {
      label: 'Üniversite',
      aliases: ['üniversite', 'universite', 'üniversitesi', 'university', 'universities'],
      selectors: [['amenity', 'university'], ['building', 'university']]
    },
    park: {
      label: 'Park',
      aliases: ['park', 'parkı', 'parklar', 'parks'],
      selectors: [['leisure', 'park']]
    },
    shopping_centre: {
      label: 'AVM',
      aliases: ['avm', 'alışveriş merkezi', 'alisveris merkezi', 'shopping centre', 'shopping center', 'mall'],
      selectors: [['shop', 'mall'], ['amenity', 'marketplace']]
    },
    supermarket: {
      label: 'Market',
      aliases: [
        'market', 'marketi', 'marketler', 'süpermarket', 'supermarket', 'grocery',
        'bakkal', 'bakkallar', 'convenience store'
      ],
      selectors: [
        ['shop', 'supermarket'],
        ['shop', 'convenience'],
        ['shop', 'grocery'],
        ['shop', 'general'],
        ['shop', 'variety_store']
      ]
    },
    shop: {
      label: 'Dükkan',
      aliases: ['dükkan', 'dukkan', 'dükkanlar', 'mağaza', 'magaza', 'shop', 'shops', 'store', 'stores'],
      selectors: [['shop']]
    },
    pharmacy: {
      label: 'Eczane',
      aliases: ['eczane', 'eczaneler', 'pharmacy', 'pharmacies'],
      selectors: [['amenity', 'pharmacy']]
    },
    clinic: {
      label: 'Klinik',
      aliases: ['klinik', 'klinikler', 'sağlık ocağı', 'clinic', 'clinics'],
      selectors: [['amenity', 'clinic'], ['amenity', 'doctors']]
    },
    library: {
      label: 'Kütüphane',
      aliases: ['kütüphane', 'kutuphane', 'kütüphaneler', 'library', 'libraries'],
      selectors: [['amenity', 'library']]
    },
    restaurant: {
      label: 'Restoran',
      aliases: ['restoran', 'restoranlar', 'lokanta', 'restaurant', 'restaurants'],
      selectors: [['amenity', 'restaurant']]
    },
    cafe: {
      label: 'Kafe',
      aliases: ['kafe', 'kafeler', 'cafe', 'cafes'],
      selectors: [['amenity', 'cafe']]
    },
    bank: {
      label: 'Banka',
      aliases: ['banka', 'bankalar', 'bank'],
      selectors: [['amenity', 'bank']]
    },
    atm: {
      label: 'ATM',
      aliases: ['atm', 'bankamatik'],
      selectors: [['amenity', 'atm']]
    },
    gas_station: {
      label: 'Benzin istasyonu',
      aliases: ['benzin istasyonu', 'akaryakıt istasyonu', 'petrol', 'gas station'],
      selectors: [['amenity', 'fuel']]
    },
    playground: {
      label: 'Oyun parkı',
      aliases: ['oyun parkı', 'oyun alanı', 'playground', 'playgrounds'],
      selectors: [['leisure', 'playground']]
    },
    police: {
      label: 'Polis merkezi',
      aliases: ['polis merkezi', 'karakol', 'police station'],
      selectors: [['amenity', 'police']]
    },
    fire_station: {
      label: 'İtfaiye',
      aliases: ['itfaiye', 'itfaiye istasyonu', 'fire station'],
      selectors: [['amenity', 'fire_station']]
    },
    kindergarten: {
      label: 'Kreş',
      aliases: ['kreş', 'kres', 'anaokulu', 'kindergarten'],
      selectors: [['amenity', 'kindergarten']]
    }
  });

  function normalizeCoordinates(value) {
    if (!value) return null;
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  }

  function normalizeQuery(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  }

  function normalizeName(value) {
    return String(value || '')
      .trim()
      .toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function categoryForQuery(value) {
    const query = normalizeName(value)
      .replace(/^(yakindaki|yakinda|tum|butun)\s+/, '')
      .replace(/\s+(yerleri|yerler|yakindaki|yakinda)$/, '');
    return Object.entries(CATEGORIES).find(([, category]) =>
      category.aliases.some((alias) => normalizeName(alias) === query)
    ) || null;
  }

  function normalizePlace(result) {
    if (!result) return null;
    const location = normalizeCoordinates(result.location || { lat: result.lat, lng: result.lon });
    const address = String(result.address || result.display_name || '').trim();
    const name = String(result.name || '').trim() || address.split(',')[0].trim();
    const id = result.id || (result.osm_type && result.osm_id
      ? String(result.osm_type) + ':' + String(result.osm_id)
      : '');
    if (!location || !name || !address || !id) return null;
    return {
      id: id.slice(0, 200),
      name: name.slice(0, 120),
      address: address.slice(0, 240),
      location
    };
  }

  function normalizeResults(results) {
    const seen = new Set();
    return (Array.isArray(results) ? results : [])
      .map(normalizePlace)
      .filter((place) => {
        if (!place || seen.has(place.id)) return false;
        seen.add(place.id);
        return true;
      })
      .slice(0, MAX_RESULTS);
  }

  function mergeCategoryMembers(existingMembers, places, limit = 500) {
    const members = new Map();
    (Array.isArray(existingMembers) ? existingMembers : []).forEach((member) => {
      const id = String(member && (member.geocodeId || member.id) || '');
      const lat = Number(member && member.lat);
      const lng = Number(member && member.lng);
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lng) || members.has(id)) return;
      members.set(id, {
        ...member,
        id: String(member.id || id),
        geocodeId: id,
        lat,
        lng,
        radius: Number(member.radius) || 100,
        inside: Boolean(member.inside)
      });
    });
    (Array.isArray(places) ? places : []).forEach((place) => {
      const id = String(place && place.id || '');
      const location = normalizeCoordinates(place && place.location);
      if (!id || !location || members.has(id)) return;
      members.set(id, {
        id,
        name: String(place.name || '').slice(0, 120),
        address: String(place.address || '').slice(0, 240),
        geocodeId: id,
        lat: location.lat,
        lng: location.lng,
        radius: 100,
        inside: false
      });
    });
    const maxMembers = Math.max(1, Math.min(500, Math.floor(Number(limit) || 500)));
    return Array.from(members.values()).slice(0, maxMembers);
  }

  function resolveUniqueExactMatch(query, places) {
    const target = normalizeName(query);
    if (!target || !Array.isArray(places)) return null;
    const exact = places.filter((place) => normalizeName(place && place.name) === target);
    return exact.length === 1 ? exact[0] : null;
  }

  function updateSavedPlaceCoordinates(savedPlace, resolvedPlace) {
    const location = normalizeCoordinates(resolvedPlace && resolvedPlace.location);
    if (!savedPlace || !resolvedPlace || !resolvedPlace.id || !location) {
      throw new Error('Çözümlenen konum kayıtlı alana bağlanamadı');
    }
    return {
      ...savedPlace,
      lat: location.lat,
      lng: location.lng,
      geocodeId: String(resolvedPlace.id).slice(0, 200),
      inside: false,
      knownInside: false,
      breakUntil: 0
    };
  }

  function createNominatimGeocoder(options = {}) {
    const fetchImpl = options.fetchImpl || root.fetch.bind(root);
    const storage = options.storage || root.localStorage;
    const now = options.now || Date.now;
    const wait = options.wait || ((milliseconds) =>
      new Promise((resolve) => root.setTimeout(resolve, milliseconds)));
    let requestQueue = Promise.resolve();
    let categoryCache = new Map();
    let categoryQueue = Promise.resolve();

    async function fetchRequest(url, init) {
      const controller = root.AbortController ? new root.AbortController() : null;
      const timeout = controller
        ? root.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : null;
      try {
        return await fetchImpl(url, {
          ...init,
          ...(controller ? { signal: controller.signal } : {})
        });
      } catch (error) {
        if (error && error.name === 'AbortError') {
          throw new Error('Yer arama isteği zaman aşımına uğradı');
        }
        throw error;
      } finally {
        if (timeout != null) root.clearTimeout(timeout);
      }
    }

    function assertProviderAvailable(kind) {
      const backoffKey = BACKOFF_PREFIX + kind;
      const blockedUntil = Number(storage.getItem(backoffKey)) || 0;
      const remaining = blockedUntil - now();
      if (remaining > 0) {
        throw new Error('Yer arama hizmeti yoğun. ' +
          Math.ceil(remaining / 1000) + ' saniye sonra yeniden dene.');
      }
    }

    async function fetchProvider(kind, url, init) {
      assertProviderAvailable(kind);
      const backoffKey = BACKOFF_PREFIX + kind;
      try {
        const response = await fetchRequest(url, init);
        if (!response || !response.ok) {
          const status = response ? Number(response.status) || 0 : 0;
          const retryAfter = response && response.headers &&
            typeof response.headers.get === 'function'
            ? Number(response.headers.get('Retry-After'))
            : 0;
          const baseDelay = status === 429 || status === 503
            ? Math.max(30000, retryAfter * 1000)
            : (status >= 500 || status === 0 ? 10000 : 0);
          if (baseDelay) {
            const previousUntil = Number(storage.getItem(backoffKey)) || 0;
            const previousDelay = Math.max(0, previousUntil - now());
            const delay = Math.min(5 * 60 * 1000, Math.max(baseDelay, previousDelay * 2));
            storage.setItem(backoffKey, String(now() + delay));
          }
          const reason = status ? String(status) : 'network';
          throw new Error('Yer arama hizmeti yanıt vermedi (' + reason + ')');
        }
        storage.removeItem(backoffKey);
        return response;
      } catch (error) {
        if (/yanıt vermedi/.test(String(error && error.message))) throw error;
        const previousUntil = Number(storage.getItem(backoffKey)) || 0;
        const previousDelay = Math.max(0, previousUntil - now());
        const delay = Math.min(5 * 60 * 1000, Math.max(10000, previousDelay * 2));
        storage.setItem(backoffKey, String(now() + delay));
        throw error;
      }
    }

    async function serviceConfig() {
      if (options.getServiceConfig) {
        return validateServiceConfig(await options.getServiceConfig());
      }
      if (!root.document || !root.document.baseURI) {
        return { nominatimEndpoint: ENDPOINT, overpassEndpoint: OVERPASS_ENDPOINT };
      }
      const configUrl = new URL(SERVICE_CONFIG_FILE, root.document.baseURI);
      const response = await fetchRequest(configUrl.toString(), { cache: 'no-store' });
      if (!response || !response.ok) {
        const status = response ? response.status : 'network';
        throw new Error('Yer arama hizmeti ayarları yüklenemedi (' + status + ')');
      }
      return validateServiceConfig(await response.json());
    }

    function validateServiceConfig(config) {
      const candidate = config && typeof config === 'object' ? config : {};
      const validateEndpoint = (value, fallback) => {
        const url = new URL(String(value || fallback));
        if (url.protocol !== 'https:') throw new Error('Yer arama hizmeti HTTPS kullanmalı');
        return url.toString();
      };
      return {
        nominatimEndpoint: validateEndpoint(candidate.nominatimEndpoint, ENDPOINT),
        overpassEndpoint: validateEndpoint(candidate.overpassEndpoint, OVERPASS_ENDPOINT),
        placeProviderName: String(candidate.placeProviderName || 'OpenStreetMap Nominatim').slice(0, 80),
        categoryProviderName: String(candidate.categoryProviderName || 'OpenStreetMap Overpass').slice(0, 80)
      };
    }

    function readCache() {
      const raw = storage.getItem(CACHE_KEY);
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        storage.removeItem(CACHE_KEY);
        return {};
      }
    }

    function cachedResult(query) {
      const cache = readCache();
      const entry = cache[normalizeName(query)];
      const ttl = entry && Array.isArray(entry.results) && entry.results.length
        ? CACHE_TTL_MS
        : EMPTY_CACHE_TTL_MS;
      if (!entry || !Number.isFinite(Number(entry.savedAt)) ||
          now() - Number(entry.savedAt) > ttl) return null;
      return normalizeResults(entry.results);
    }

    function saveCache(query, places) {
      const cache = readCache();
      const key = normalizeName(query);
      cache[key] = { savedAt: now(), results: places };
      const recent = Object.entries(cache)
        .sort((left, right) => Number(right[1].savedAt) - Number(left[1].savedAt))
        .slice(0, MAX_CACHE_ENTRIES);
      storage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(recent)));
    }

    async function requestPlaces(query, activeConfig) {
      const cached = cachedResult(query);
      if (cached) return cached;

      const config = activeConfig || await serviceConfig();
      assertProviderAvailable('nominatim');
      const lastRequestAt = Number(storage.getItem(LAST_REQUEST_KEY)) || 0;
      const elapsed = Math.max(0, now() - lastRequestAt);
      const delay = MIN_REQUEST_INTERVAL_MS - elapsed;
      if (delay > 0) await wait(delay);
      storage.setItem(LAST_REQUEST_KEY, String(now()));

      const url = new URL(config.nominatimEndpoint);
      url.search = new URLSearchParams({
        q: query,
        format: 'jsonv2',
        addressdetails: '1',
        limit: String(MAX_RESULTS),
        'accept-language': 'tr'
      }).toString();
      const response = await fetchProvider('nominatim', url.toString(), {
        headers: { Accept: 'application/json' },
        referrerPolicy: 'strict-origin-when-cross-origin'
      });
      if (!response || !response.ok) {
        const status = response ? response.status : 'network';
        throw new Error('Yer arama hizmeti yanıt vermedi (' + status + ')');
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Yer arama hizmetinden geçersiz yanıt alındı');
      }
      const places = normalizeResults(data);
      saveCache(query, places);
      return places;
    }

    function normalizeCategoryPlaces(elements, category) {
      const seen = new Set();
      const places = (Array.isArray(elements) ? elements : [])
        .map((element) => {
          const tags = element && element.tags ? element.tags : {};
          const point = element && (element.center || element);
          const location = point
            ? normalizeCoordinates({ lat: point.lat, lng: point.lon })
            : null;
          if (!location || !element.type || !element.id) return null;
          const name = String(tags.name || tags['name:tr'] || '').trim() ||
            category.label + ' (' + location.lat.toFixed(5) + ', ' + location.lng.toFixed(5) + ')';
          const address = [
            tags['addr:street'],
            tags['addr:housenumber'],
            tags['addr:suburb'],
            tags['addr:city']
          ].filter(Boolean).join(', ') || location.lat.toFixed(5) + ', ' + location.lng.toFixed(5);
          return {
            id: String(element.type) + ':' + String(element.id),
            name: name.slice(0, 120),
            address: address.slice(0, 240),
            location
          };
        })
        .filter((place) => {
          if (!place || seen.has(place.id)) return false;
          seen.add(place.id);
          return true;
        });
      return {
        places: places.slice(0, MAX_CATEGORY_RESULTS),
        capped: places.length > MAX_CATEGORY_RESULTS
      };
    }

    function createOverpassQuery(category, location) {
      const coords = normalizeCoordinates(location);
      if (!coords) throw new Error('Kategori araması için geçerli cihaz konumu gerekli');
      const searchCenter = {
        lat: Number(coords.lat.toFixed(3)),
        lng: Number(coords.lng.toFixed(3))
      };
      const selectors = category[1].selectors.map((selector) => {
        const [key, value, extraKey, extraValue] = selector;
        const tags = '["' + key + '"' + (value ? '="' + value + '"' : '') + ']' +
          (extraKey ? '["' + extraKey + '"="' + extraValue + '"]' : '');
        return '  nwr(around:' + CATEGORY_SEARCH_RADIUS_METERS + ',' +
          searchCenter.lat + ',' + searchCenter.lng + ')' + tags + ';';
      });
      return '[out:json][timeout:25];\n(\n' + selectors.join('\n') +
        '\n);\nout center ' + (MAX_CATEGORY_RESULTS + 1) + ';';
    }

    async function requestCategory(category, location, activeConfig) {
      const coords = normalizeCoordinates(location);
      if (!coords) throw new Error('Kategori araması için geçerli cihaz konumu gerekli');
      const key = category[0] + ':' + coords.lat.toFixed(5) + ':' + coords.lng.toFixed(5);
      const cached = categoryCache.get(key);
      if (cached && now() - cached.savedAt < CATEGORY_CACHE_TTL_MS) return cached.result;

      const config = activeConfig || await serviceConfig();
      assertProviderAvailable('overpass');
      const lastRequestAt = Number(storage.getItem(LAST_CATEGORY_REQUEST_KEY)) || 0;
      const elapsed = Math.max(0, now() - lastRequestAt);
      const delay = MIN_CATEGORY_REQUEST_INTERVAL_MS - elapsed;
      if (delay > 0) await wait(delay);
      storage.setItem(LAST_CATEGORY_REQUEST_KEY, String(now()));

      const response = await fetchProvider('overpass', config.overpassEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: 'data=' + encodeURIComponent(createOverpassQuery(category, coords)),
        referrerPolicy: 'strict-origin-when-cross-origin'
      });
      if (!response || !response.ok) {
        const status = response ? response.status : 'network';
        throw new Error('Yakındaki yer arama hizmeti yanıt vermedi (' + status + ')');
      }
      const data = await response.json();
      if (data && data.remark) {
        throw new Error('Yakındaki yer araması tamamlanamadı: ' +
          String(data.remark).slice(0, 160));
      }
      if (!data || !Array.isArray(data.elements)) {
        throw new Error('Yakındaki yer arama hizmetinden geçersiz yanıt alındı');
      }
      const result = normalizeCategoryPlaces(data.elements, category[1]);
      categoryCache.set(key, { savedAt: now(), result });
      return result;
    }

    return Object.freeze({
      getServiceConfig() {
        return serviceConfig();
      },
      search(value, activeConfig) {
        const query = normalizeQuery(value);
        if (!query) return Promise.reject(new Error('Yer adı veya adres gerekli'));
        const cached = cachedResult(query);
        if (cached) return Promise.resolve(cached);

        const queuedRequest = requestQueue.then(() => requestPlaces(query, activeConfig));
        requestQueue = queuedRequest.catch(() => {});
        return queuedRequest;
      },
      searchCategory(value, location, activeConfig) {
        const category = categoryForQuery(value);
        if (!category) return Promise.reject(new Error('Bu yer türü desteklenmiyor'));
        const queuedRequest = categoryQueue.then(() =>
          requestCategory(category, location, activeConfig)
        );
        categoryQueue = queuedRequest.catch(() => {});
        return queuedRequest;
      }
    });
  }

  const api = Object.freeze({
    CACHE_TTL_MS,
    CATEGORY_SEARCH_RADIUS_METERS,
    MAX_CACHE_ENTRIES,
    MAX_CATEGORY_RESULTS,
    MAX_RESULTS,
    MIN_CATEGORY_REQUEST_INTERVAL_MS,
    MIN_REQUEST_INTERVAL_MS,
    REQUEST_TIMEOUT_MS,
    categoryForQuery,
    createNominatimGeocoder,
    mergeCategoryMembers,
    normalizeCoordinates,
    normalizeQuery,
    normalizeResults,
    resolveUniqueExactMatch,
    updateSavedPlaceCoordinates
  });
  root.AreaPlaceGeocoder = api;

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
