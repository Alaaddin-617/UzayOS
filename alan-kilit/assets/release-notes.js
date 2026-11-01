'use strict';

(function (root) {
  const VERSION_PATTERN = /^\d+(?:\.\d+){1,3}$/;

  function compareVersions(left, right) {
    const parse = (value) => {
      if (!VERSION_PATTERN.test(String(value || ''))) return null;
      return String(value).split('.').map(Number);
    };
    const a = parse(left);
    const b = parse(right);
    if (!a || !b) return null;

    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const difference = (a[i] || 0) - (b[i] || 0);
      if (difference) return Math.sign(difference);
    }
    return 0;
  }

  function normalizeManifest(raw) {
    if (!raw || typeof raw !== 'object' || !VERSION_PATTERN.test(String(raw.version || ''))) {
      return null;
    }

    const releases = Array.isArray(raw.releases)
      ? raw.releases
        .filter((release) => release && VERSION_PATTERN.test(String(release.version || '')))
        .map((release) => ({
          version: String(release.version),
          changes: Array.isArray(release.changes)
            ? release.changes
              .filter((change) => typeof change === 'string' && change.trim())
              .slice(0, 12)
              .map((change) => change.trim().slice(0, 300))
            : []
        }))
      : [];

    return { version: String(raw.version), releases };
  }

  function notesFor(manifest, version) {
    if (!manifest || !Array.isArray(manifest.releases)) return null;
    return manifest.releases.find((release) => release.version === String(version)) || null;
  }

  const api = Object.freeze({ compareVersions, normalizeManifest, notesFor });
  root.AreaReleaseNotes = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(globalThis);
