'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_RADIUS,
  classifyCategoryMembers,
  classifyLocation,
  storedRadius
} = require('../assets/geofence.js');

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

test('geocoded locations require GPS uncertainty to fit inside the boundary', () => {
  assert.equal(classifyLocation(40, 20, 100), 'inside');
  assert.equal(classifyLocation(90, 20, 100), 'uncertain');
  assert.equal(classifyLocation(131, 10, 100, 20), 'outside');
  assert.equal(classifyLocation(20, 120, 100), 'uncertain');
  assert.equal(classifyLocation(Number.NaN, 10, 100), 'uncertain');
});

test('one category rule enters when any returned place is confidently entered', () => {
  const members = [
    { id: 'mosque-a', lat: 41, lng: 29, radius: 100 },
    { id: 'mosque-b', lat: 41.01, lng: 29, radius: 100 }
  ];
  assert.equal(classifyCategoryMembers(members, {
    lat: 41.0001,
    lng: 29,
    accuracy: 10
  }).state, 'inside');
});

test('category rule exits only when all returned places are confidently outside', () => {
  const members = [
    { id: 'school-a', lat: 41, lng: 29, radius: 100 },
    { id: 'school-b', lat: 41.01, lng: 29, radius: 100 }
  ];
  assert.equal(classifyCategoryMembers(members, {
    lat: 41.0009,
    lng: 29,
    accuracy: 5
  }).state, 'uncertain');
  assert.equal(classifyCategoryMembers(members, {
    lat: 41.2,
    lng: 29,
    accuracy: 5
  }).state, 'outside');
});

test('category rule stays uncertain rather than locking on inaccurate GPS', () => {
  const result = classifyCategoryMembers([
    { id: 'park', lat: 41, lng: 29, radius: 100 }
  ], {
    lat: 41,
    lng: 29,
    accuracy: 150
  });
  assert.equal(result.state, 'uncertain');
});
