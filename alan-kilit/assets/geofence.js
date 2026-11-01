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

  function classifyLocation(distance, accuracy, radius, hysteresis = 0) {
    const d = Number(distance);
    const a = Number(accuracy);
    const r = Number(radius);
    const h = Math.max(0, Number(hysteresis) || 0);
    if (!Number.isFinite(d) || !Number.isFinite(a) || !Number.isFinite(r) ||
        d < 0 || a < 0 || r <= 0 || a > r) {
      return 'uncertain';
    }
    if (d + a <= r) return 'inside';
    if (d - a > r + h) return 'outside';
    return 'uncertain';
  }

  const geofence = Object.freeze({ DEFAULT_RADIUS, storedRadius, classifyLocation });
  root.AreaGeofence = geofence;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = geofence;
  }
})(globalThis);
