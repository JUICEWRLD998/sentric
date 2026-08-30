import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  hedgeSize,
  premiumFor,
  maxPremium,
  planHedge,
  shouldHedge,
} from '../hedge.js';

test('hedgeSize scales linearly with exposure', () => {
  assert.equal(hedgeSize(100), 100);
  assert.equal(hedgeSize(200), 200);
  assert.equal(hedgeSize(1000, 0.5), 500);
  assert.equal(hedgeSize(0), 0);
});

test('premiumFor is size times price', () => {
  assert.equal(premiumFor(100, 0.42), 42);
});

test('maxPremium is exposure times the premium fraction', () => {
  assert.equal(maxPremium(1000), 50); // default 5%
  assert.equal(maxPremium(1000, 0.1), 100);
});

test('planHedge returns hedge size and max premium, capped when premium is too large', () => {
  const plan = planHedge({ exposure: 1000, price: 0.5, maxPremiumFraction: 0.1 });
  // desired premium = 1000 * 0.5 = 500 > cap 100 -> size scaled to 100 / 0.5 = 200
  assert.equal(plan.maxPremium, 100);
  assert.equal(plan.premium, 100);
  assert.equal(plan.hedgeSize, 200);
  assert.equal(plan.capped, true);
});

test('planHedge leaves a cheap hedge uncapped', () => {
  const plan = planHedge({ exposure: 100, price: 0.4, maxPremiumFraction: 1 });
  assert.equal(plan.hedgeSize, 100);
  assert.equal(plan.premium, 40);
  assert.equal(plan.maxPremium, 100);
  assert.equal(plan.capped, false);
});

test('planHedge honors a partial hedge ratio', () => {
  const plan = planHedge({
    exposure: 1000,
    price: 0.42,
    hedgeRatio: 0.5,
    maxPremiumFraction: 0.5, // cap high enough not to clip the desired premium
  });
  assert.equal(plan.hedgeSize, 500);
  assert.equal(plan.premium, 210);
  assert.equal(plan.capped, false);
});

test('planHedge throws on a non-positive price', () => {
  assert.throws(() => planHedge({ exposure: 100, price: 0 }), /price/i);
  assert.throws(() => planHedge({ exposure: 100, price: -0.1 }), /price/i);
});

test('shouldHedge triggers on a drop above the sigma threshold', () => {
  assert.equal(shouldHedge(-2.1, 4.2, 3.0), true);
  assert.equal(shouldHedge(-3.0, 3.0, 3.0), true); // boundary: >= threshold
});

test('shouldHedge does not trigger below the sigma threshold', () => {
  assert.equal(shouldHedge(-0.5, 1.0, 3.0), false);
  assert.equal(shouldHedge(-2.0, 2.9, 3.0), false);
});

test('shouldHedge does not trigger on a rise, regardless of magnitude', () => {
  assert.equal(shouldHedge(2.1, 4.2, 3.0), false);
  assert.equal(shouldHedge(0, 4.2, 3.0), false);
});
