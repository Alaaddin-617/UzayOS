'use strict';

(function (root) {
  const DEFAULT_RADIUS = 100;
  const MIN_RADIUS = 50;
  const MAX_RADIUS = 1000;

  function storedRadius(value, fallback = DEFAULT_RADIUS) {
    const parsed = value === undefined || value === null || value === ''
      ? Number(fallback)
      : Number(value);
    const radius = Number.isFinite(parsed) ? Math.round(parsed) : DEFAULT_RADIUS;
    return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, radius));
  }

  const geofence = Object.freeze({ DEFAULT_RADIUS, storedRadius });
  root.AreaGeofence = geofence;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = geofence;
  }
})(globalThis);
