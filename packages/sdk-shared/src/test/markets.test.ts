import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSymbol,
  downPrice,
  upPrice,
  clampProbability,
  completeSetPrice,
} from '../markets.js';

test('parseSymbol parses a YES (Up) symbol', () => {
  const s = parseSymbol('BTC-0-12AUG26-1600/USDso#YES');
  assert.deepEqual(s, {
    asset: 'BTC',
    strikeWindow: '0',
    expiry: '12AUG26-1600',
    side: 'YES',
  });
});

test('parseSymbol parses a NO (Down) symbol', () => {
  const s = parseSymbol('ETH-1-13AUG26-1630/USDso#NO');
  assert.deepEqual(s, {
    asset: 'ETH',
    strikeWindow: '1',
    expiry: '13AUG26-1630',
    side: 'NO',
  });
});

test('parseSymbol is case-insensitive on the asset and keeps the side exact', () => {
  assert.equal(parseSymbol('eth-0-12AUG26-1600/USDso#NO').asset, 'ETH');
  assert.equal(parseSymbol('BTC-0-12AUG26-1600/USDso#NO').side, 'NO');
});

test('parseSymbol throws on an unsupported asset', () => {
  assert.throws(() => parseSymbol('DOGE-0-12AUG26-1600/USDso#YES'), /asset/i);
});

test('parseSymbol throws on a malformed symbol', () => {
  assert.throws(() => parseSymbol('not-a-symbol'), /invalid event contract symbol/i);
  assert.throws(() => parseSymbol('BTC-0-12AUG26-1600/USDso#MAYBE'), /invalid event contract symbol/i);
});

test('downPrice is the complement of the Up price', () => {
  assert.equal(downPrice(0.6), 0.4);
  assert.equal(downPrice(0.25), 0.75);
  assert.equal(downPrice(0.5), 0.5);
});

test('upPrice is the complement of the Down price', () => {
  assert.equal(upPrice(0.4), 0.6);
  assert.equal(upPrice(0.75), 0.25);
});

test('downPrice clamps into the open (0, 1) interval', () => {
  assert.ok(downPrice(2) > 0 && downPrice(2) < 1);
  assert.ok(downPrice(-1) > 0 && downPrice(-1) < 1);
  assert.ok(downPrice(0) > 0 && downPrice(0) < 1);
  assert.ok(downPrice(1) > 0 && downPrice(1) < 1);
});

test('Up and Down prices sum to 1 for in-range inputs', () => {
  assert.equal(0.6 + downPrice(0.6), 1);
  assert.equal(0.4 + downPrice(0.4), 1);
  // upPrice is the inverse of downPrice: upPrice(downPrice(p)) === p.
  assert.equal(upPrice(downPrice(0.4)), 0.4);
  assert.equal(downPrice(upPrice(0.6)), 0.6);
});

test('clampProbability never returns 0 or 1', () => {
  assert.ok(clampProbability(-5) > 0);
  assert.ok(clampProbability(5) < 1);
});

test('a complete set (1 Up + 1 Down) costs ~1 USDso', () => {
  const cost = completeSetPrice(0.42);
  assert.ok(Math.abs(cost - 1) < 1e-9);
});
