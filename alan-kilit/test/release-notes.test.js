'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeManifest, notesFor } = require('../assets/release-notes.js');

test('normalizes and returns release notes by exact version', () => {
  const manifest = normalizeManifest({
    version: '1.2.0',
    releases: [
      { version: '1.1.9', changes: [' Older change '] },
      { version: '1.2.0', changes: ['New location behavior'] }
    ]
  });

  assert.equal(manifest.version, '1.2.0');
  assert.deepEqual(notesFor(manifest, '1.2.0').changes, ['New location behavior']);
  assert.equal(notesFor(manifest, '1.1.8'), null);
});

test('rejects invalid manifest versions and ignores malformed release entries', () => {
  assert.equal(normalizeManifest({ version: 'latest' }), null);
  const manifest = normalizeManifest({
    version: '1.2.0',
    releases: [
      { version: 'bad', changes: ['ignored'] },
      { version: '1.2.0', changes: ['  ', '<unsafe>'] }
    ]
  });

  assert.deepEqual(manifest.releases, [{ version: '1.2.0', changes: ['<unsafe>'] }]);
});

test('bounds release note counts and text length', () => {
  const manifest = normalizeManifest({
    version: '1.2.0',
    releases: [{
      version: '1.2.0',
      changes: Array.from({ length: 14 }, (_, index) => String(index).repeat(400))
    }]
  });

  assert.equal(manifest.releases[0].changes.length, 12);
  assert.equal(manifest.releases[0].changes[0].length, 300);
});
