'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { compareVersions, normalizeManifest, notesFor } = require('../assets/release-notes.js');

test('compares installed and latest app versions for update availability', () => {
  assert.equal(compareVersions('1.1.8', '1.1.8'), 0);
  assert.equal(compareVersions('1.1.7', '1.1.8'), -1);
  assert.equal(compareVersions('1.1.9', '1.1.8'), 1);
  assert.equal(compareVersions('1.1.9', '1.2.0'), -1);
  assert.equal(compareVersions('1.2.0', '1.2.1'), -1);
  assert.equal(compareVersions('1.2.1', '1.2.1'), 0);
  assert.equal(compareVersions('1.1.8', 'invalid'), null);
});

test('application version matches the published latest-version manifest', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');
  const appVersion = appSource.match(/const APP_VERSION = '([^']+)'/);
  const manifest = normalizeManifest(JSON.parse(
    fs.readFileSync(path.join(__dirname, '../version.json'), 'utf8')
  ));

  assert.ok(appVersion, 'APP_VERSION must be declared in app.js');
  assert.equal(appVersion[1], manifest.version);
});

test('standalone copies redirect to the live app when stale and keep an offline update action', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../assets/app.js'), 'utf8');

  assert.match(appSource, /if \(location\.protocol === 'file:'\) \{\s+const updateUrl = new URL\(REMOTE_UPDATE_URL\)/);
  assert.match(appSource, /location\.replace\(updateUrl\.toString\(\)\)/);
  assert.match(appSource, /Güncel uygulamayı aç/);
  assert.match(appSource, /checkLatestVersion\(\);/);
});

test('normalizes and returns release notes by exact version', () => {
  const manifest = normalizeManifest({
    version: '1.2.1',
    releases: [
      { version: '1.1.9', changes: [' Older change '] },
      { version: '1.2.1', changes: ['New location behavior'] }
    ]
  });

  assert.equal(manifest.version, '1.2.1');
  assert.deepEqual(notesFor(manifest, '1.2.1').changes, ['New location behavior']);
  assert.equal(notesFor(manifest, '1.1.8'), null);
});

test('rejects invalid manifest versions and ignores malformed release entries', () => {
  assert.equal(normalizeManifest({ version: 'latest' }), null);
  const manifest = normalizeManifest({
    version: '1.2.1',
    releases: [
      { version: 'bad', changes: ['ignored'] },
      { version: '1.2.1', changes: ['  ', '<unsafe>'] }
    ]
  });

  assert.deepEqual(manifest.releases, [{ version: '1.2.1', changes: ['<unsafe>'] }]);
});

test('bounds release note counts and text length', () => {
  const manifest = normalizeManifest({
    version: '1.2.1',
    releases: [{
      version: '1.2.0',
      changes: Array.from({ length: 14 }, (_, index) => String(index).repeat(400))
    }]
  });

  assert.equal(manifest.releases[0].changes.length, 12);
  assert.equal(manifest.releases[0].changes[0].length, 300);
});
