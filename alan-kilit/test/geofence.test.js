'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { DEFAULT_RADIUS, storedRadius } = require('../assets/geofence.js');

test('new areas use the internal default without a user setting', () => {
  assert.equal(DEFAULT_RADIUS, 100);
});

test('saved area boundaries remain intact for existing users', () => {
  assert.equal(storedRadius(350), 350);
});

test('invalid and out-of-range stored boundaries are safely normalized', () => {
  assert.equal(storedRadius(undefined), DEFAULT_RADIUS);
  assert.equal(storedRadius('not a number'), DEFAULT_RADIUS);
  assert.equal(storedRadius(10), 50);
  assert.equal(storedRadius(1200), 1000);
});
