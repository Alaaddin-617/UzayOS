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

  function classifyCategoryMembers(members, fix, hysteresis = 0) {
    if (!Array.isArray(members) || !members.length || !fix) {
      return { state: 'uncertain', nearestDistance: null, memberStates: [] };
    }

    const memberStates = members.map((member) => {
      const lat = Number(member && member.lat);
      const lng = Number(member && member.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
          Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
          !Number.isFinite(Number(fix.lat)) || !Number.isFinite(Number(fix.lng)) ||
          Math.abs(Number(fix.lat)) > 90 || Math.abs(Number(fix.lng)) > 180) {
        return { member, distance: null, state: 'uncertain' };
      }
      const toRadians = (degrees) => degrees * Math.PI / 180;
      const earthRadius = 6371000;
      const deltaLat = toRadians(lat - Number(fix.lat));
      const deltaLng = toRadians(lng - Number(fix.lng));
      const a = Math.sin(deltaLat / 2) ** 2 +
        Math.cos(toRadians(Number(fix.lat))) * Math.cos(toRadians(lat)) *
        Math.sin(deltaLng / 2) ** 2;
      const distance = earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return {
        member,
        distance,
        state: classifyLocation(
          distance,
          fix.accuracy,
          storedRadius(member.radius),
          hysteresis
        )
      };
    });

    const validDistances = memberStates
      .map((item) => item.distance)
      .filter((distance) => Number.isFinite(distance));
    const anyInside = memberStates.some((item) => item.state === 'inside');
    const allOutside = memberStates.every((item) => item.state === 'outside');
    return {
      state: anyInside ? 'inside' : (allOutside ? 'outside' : 'uncertain'),
      nearestDistance: validDistances.length ? Math.min(...validDistances) : null,
      memberStates
    };
  }

  const geofence = Object.freeze({
    DEFAULT_RADIUS,
    storedRadius,
    classifyLocation,
    classifyCategoryMembers
  });
  root.AreaGeofence = geofence;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = geofence;
  }
})(globalThis);
