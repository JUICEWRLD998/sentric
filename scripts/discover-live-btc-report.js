// Discover live BTC binary Event Contract market on Somnia Shannon testnet.
// Outputs a compact JSON report. Never prints the private key.
const fs = require('fs');
const path = require('path');

const VIEM_PATH = 'C:/Users/fadhm/Desktop/somnia/node_modules/.pnpm/viem@2.56.0_typescript@5.9.3_zod@4.5.4/node_modules/viem';
const viem = require(VIEM_PATH);
const { createPublicClient, http, parseAbi, decodeEventLog, keccak256, toHex } = viem;
const { privateKeyToAccount } = require(VIEM_PATH + '/accounts');

// --- env (URL + private key; key stays in memory, only address is printed) ---
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const RPC = env.SOMNIA_RPC_URL || 'https://api.infra.testnet.somnia.network';
const PK = env.DEPLOYER_PRIVATE_KEY;
if (!PK) { console.error('NO DEPLOYER_PRIVATE_KEY in .env'); process.exit(1); }
const account = privateKeyToAccount(PK.startsWith('0x') ? PK : '0x' + PK);
const DEPLOYER = account.address;

const MODULE = '0x3ecC694Cef705358864a646142ac17A90E29e388';
const TUSDC = '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E';
const RECIPE_TOPIC0 = '0xb5ec75cdb7dbcd28a5f50d152d8833334525a902ef5332ebc19bcf5c0011f8cd';

const client = createPublicClient({
  transport: http(RPC, { retryCount: 5, retryDelay: 1500, timeout: 25000 }),
});

const moduleAbi = parseAbi([
  'function markets(bytes32 marketId) view returns (uint256 oracleQuestionId, uint8 outcomeSlotCount, uint8 voidPolicy, address collateral, uint32 originOperatorId, bytes32 originVenueId, address oracleAdapter, address creator, address market, address pool, uint256 yesId, uint256 noId, uint64 tradingStart, uint64 expiry)',
]);
const marketAbi = parseAbi([
  'function status() view returns (uint8)',
  'function isResolved() view returns (bool)',
  'function payoutNumerators() view returns (uint256[])',
]);
const poolAbi = parseAbi([
  'function getBookLevels(bool isBid, uint64 numLevels) view returns ((uint256 price, uint256 quantity)[])',
  'function getOrderBookParameters() view returns ((uint256 tickSize, uint256 minQuantity, uint256 lotSize))',
  'function marketNonce() view returns (uint64)',
  'function marketExpiryNs() view returns (uint64)',
  'function getBinaryPoolParams() view returns ((address collateralToken, address market, address outcomeToken, uint256 yesId, uint256 noId, uint256 oneCollateral, uint256 setBacking, address feeRecipient, uint256 makerFeeBpsTimes1k, uint256 takerFeeBpsTimes1k, uint256 maxBuilderFeeBpsTimes1k, uint256 settlementFeeBpsTimes1k, address settlement, uint64 marketNonce, bool finalized))',
]);
const tusdcAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);

const marketCreatedEvent = {
  type: 'event', name: 'MarketCreated', anonymous: false,
  inputs: [
    { name: 'marketId', type: 'bytes32', indexed: true },
    { name: 'market', type: 'address', indexed: true },
    { name: 'pool', type: 'address', indexed: true },
    { name: 'oracleQuestionId', type: 'uint256', indexed: false },
    { name: 'operatorId', type: 'uint32', indexed: false },
    { name: 'venueId', type: 'bytes32', indexed: false },
    { name: 'creator', type: 'address', indexed: false },
    { name: 'collateral', type: 'address', indexed: false },
    { name: 'yesId', type: 'uint256', indexed: false },
    { name: 'noId', type: 'uint256', indexed: false },
    { name: 'nonce', type: 'uint64', indexed: false },
    { name: 'outcomeSlotCount', type: 'uint8', indexed: false },
    { name: 'marketType', type: 'uint8', indexed: false },
    { name: 'tradingStart', type: 'uint64', indexed: false },
    { name: 'expiry', type: 'uint64', indexed: false },
    { name: 'voidPolicy', type: 'uint8', indexed: false },
    { name: 'asset', type: 'string', indexed: false },
    { name: 'strike', type: 'uint256', indexed: false },
    { name: 'question', type: 'string', indexed: false },
    { name: 'context', type: 'bytes', indexed: false },
  ],
};

const sig = 'MarketCreated(bytes32,address,address,uint256,uint32,bytes32,address,address,uint256,uint256,uint64,uint8,uint8,uint64,uint64,uint8,string,uint256,string,bytes)';
const computedTopic0 = keccak256(toHex(sig));
if (computedTopic0 !== RECIPE_TOPIC0) {
  console.error('TOPIC0 MISMATCH: computed', computedTopic0, 'recipe', RECIPE_TOPIC0);
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const retry = async (fn, label, n = 8, validate) => {
  let lastErr;
  for (let i = 0; i < n; i++) {
    try {
      const out = await fn();
      if (validate && !validate(out)) { lastErr = new Error('empty/garbage response'); await sleep(2000 * (i + 1)); continue; }
      return out;
    }
    catch (e) { lastErr = e; await sleep(2000 * (i + 1)); }
  }
  throw new Error(`RPC call failed after ${n} retries (${label}): ${lastErr && lastErr.shortMessage || lastErr && lastErr.message || lastErr}`);
};

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  const latest = await retry(() => client.getBlockNumber(), 'getBlockNumber');
  const fromBlock = latest - 1000n;

  const logs = await retry(async () => {
    // RPC intermittently returns partial log sets — query twice and union.
    const params = [{
      address: MODULE,
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: '0x' + latest.toString(16),
      topics: [RECIPE_TOPIC0],
    }];
    const [a, b] = await Promise.all([
      client.request({ method: 'eth_getLogs', params }),
      client.request({ method: 'eth_getLogs', params }),
    ]);
    const seen = new Set();
    const out = [];
    for (const l of [...a, ...b]) {
      const k = l.blockNumber + '/' + l.transactionIndex + '/' + l.logIndex;
      if (!seen.has(k)) { seen.add(k); out.push(l); }
    }
    return out;
  }, 'eth_getLogs MarketCreated');

  const markets = [];
  for (const l of logs) {
    const d = decodeEventLog({ abi: [marketCreatedEvent], data: l.data, topics: l.topics });
    markets.push({
      marketId: d.args.marketId,
      market: d.args.market,
      pool: d.args.pool,
      asset: d.args.asset,
      question: d.args.question,
      operatorId: Number(d.args.operatorId),
      venueId: d.args.venueId,
      tradingStart: Number(d.args.tradingStart),
      expiry: Number(d.args.expiry),
      block: Number(l.blockNumber),
    });
  }

  const live = markets.filter((m) => m.expiry > nowSec);
  const btc = live.filter((m) => /btc/i.test((m.asset || '') + ' ' + (m.question || '')));
  if (btc.length === 0) {
    console.error(JSON.stringify({
      error: 'no live BTC market found in last 1000 blocks',
      nowSec, latest: String(latest), liveCount: live.length,
      live: live.map((m) => ({ asset: m.asset, expiry: m.expiry, ts: m.tradingStart })),
    }, null, 2));
    process.exit(2);
  }
  // Prefer a market with meaningful time left that is still Trading (status 1):
  // freshest by tradingStart, then shortest window, then latest expiry.
  btc.sort((a, b) =>
    b.tradingStart - a.tradingStart ||
    (a.expiry - a.tradingStart) - (b.expiry - b.tradingStart) ||
    b.expiry - a.expiry);
  let chosen = null;
  for (const cand of btc) {
    if (cand.expiry - nowSec < 30) continue;            // too little time left
    const st = await retry(() =>
      client.readContract({ address: cand.market, abi: marketAbi, functionName: 'status' }), 'status()', 8,
      (s) => typeof s === 'bigint' || typeof s === 'number').catch(() => null);
    if (st === 1n) { chosen = cand; break; }
  }
  if (!chosen) {
    chosen = btc.find((m) => m.expiry - nowSec >= 30) || btc[0];
  }

  // 2) Decode MarketRecord via markets(bytes32). NOTE: viem 2.56 returns the
  // tuple as a plain ARRAY without named accessors — use positional indices.
  const rec = await retry(() =>
    client.readContract({ address: MODULE, abi: moduleAbi, functionName: 'markets', args: [chosen.marketId] }),
    'markets(bytes32)', 8,
    (r) => Array.isArray(r) && r.length === 14 && r[8] && r[8] !== ZERO_ADDR && r[9] && r[9] !== ZERO_ADDR);
  const pool = rec[9];
  const market = rec[8];
  const collateral = rec[3];
  if (process.env.DEBUG_REPORT) {
    console.error('DEBUG chosen:', JSON.stringify({ marketId: chosen.marketId, evMarket: chosen.market, evPool: chosen.pool, recMarket: market, recPool: pool }));
  }

  // 3) Market status + pool params
  const status = await retry(() =>
    client.readContract({ address: market, abi: marketAbi, functionName: 'status' }), 'status()', 8,
    (s) => typeof s === 'bigint' || typeof s === 'number');
  const isResolved = await retry(() =>
    client.readContract({ address: market, abi: marketAbi, functionName: 'isResolved' }), 'isResolved()', 8,
    (b) => typeof b === 'boolean');
  const obp = await retry(() =>
    client.readContract({ address: pool, abi: poolAbi, functionName: 'getOrderBookParameters' }), 'getOrderBookParameters()', 8,
    (r) => r && typeof r === 'object' && r.tickSize !== undefined);
  const tickSize = Number(obp.tickSize);
  const minQuantity = Number(obp.minQuantity);
  const lotSize = Number(obp.lotSize);
  const nonce = await retry(() =>
    client.readContract({ address: pool, abi: poolAbi, functionName: 'marketNonce' }), 'marketNonce()', 8,
    (v) => typeof v === 'bigint');
  let expiryNs;
  try {
    expiryNs = await retry(() =>
      client.readContract({ address: pool, abi: poolAbi, functionName: 'marketExpiryNs' }), 'marketExpiryNs()', 8,
      (v) => typeof v === 'bigint');
  } catch (e) { expiryNs = BigInt(rec[13]) * 1000000000n; }

  let binParams = null;
  try {
    binParams = await retry(() =>
      client.readContract({ address: pool, abi: poolAbi, functionName: 'getBinaryPoolParams' }), 'getBinaryPoolParams()', 8,
      (r) => r && typeof r === 'object');
  } catch (e) { /* v1 pool — ignore */ }
  const binFinalized = binParams ? (Array.isArray(binParams) ? binParams[14] : binParams.finalized) : null;
  const binNonce = binParams ? (Array.isArray(binParams) ? binParams[13] : binParams.marketNonce) : null;

  // 4) Book: YES bids -> best NO ask = 1e6 - best YES bid
  let bids = [], asks = [];
  try {
    bids = await retry(() =>
      client.readContract({ address: pool, abi: poolAbi, functionName: 'getBookLevels', args: [true, 3n] }), 'getBookLevels(true)', 8,
      (r) => Array.isArray(r));
    asks = await retry(() =>
      client.readContract({ address: pool, abi: poolAbi, functionName: 'getBookLevels', args: [false, 3n] }), 'getBookLevels(false)', 8,
      (r) => Array.isArray(r));
  } catch (e) { /* book unavailable */ }

  const lvlPrice = (lvl) => {
    if (!lvl || typeof lvl !== 'object') return null;
    return lvl.price !== undefined ? Number(lvl.price) : Number(lvl[0]);
  };
  const bestYesBid = bids.length ? lvlPrice(bids[0]) : null;
  const bestYesAsk = asks.length ? lvlPrice(asks[0]) : null;
  const tick = Number(tickSize);
  let yesPriceHint;
  if (bestYesBid != null && tick > 0) {
    yesPriceHint = Math.ceil(bestYesBid / tick) * tick;   // tick-aligned up
  } else {
    yesPriceHint = 500000; // estimate: no book -> 0.5
  }
  const noPriceRaw = 1000000 - yesPriceHint;

  // 5) Deployer balances
  const sttWei = await retry(() => client.getBalance({ address: DEPLOYER }), 'getBalance STT', 8,
    (v) => typeof v === 'bigint');
  const tusdcRaw = await retry(() =>
    client.readContract({ address: TUSDC, abi: tusdcAbi, functionName: 'balanceOf', args: [DEPLOYER] }), 'tUSDC balanceOf', 8,
    (v) => typeof v === 'bigint');

  const windowSec = chosen.expiry - chosen.tradingStart;
  const seriesName =
    windowSec === 60 ? '1-min (60s)' :
    windowSec === 300 ? '5-min (300s)' :
    windowSec === 900 ? '15-min (900s)' :
    windowSec === 3600 ? '1-hour (3600s)' :
    windowSec === 14400 ? '4-hour (14400s)' : `${windowSec}s`;
  const venueShort = chosen.venueId.slice(0, 10) + '...' + chosen.venueId.slice(-6);
  const accepting =
    status === 1 && !isResolved && Number(expiryNs) / 1e9 > nowSec &&
    (!binParams || !binFinalized);

  const report = {
    pool,
    marketId: chosen.marketId,
    marketAddress: market,
    nonce: Number(nonce),
    expiryNs: expiryNs.toString(),
    expiryHuman: new Date(Number(expiryNs) / 1e6).toISOString(),
    tickSize: tick,
    minQuantity: Number(minQuantity),
    lotSize: Number(lotSize),
    status: Number(status),
    isTrading: status === 1 && Number(expiryNs) / 1e9 > nowSec,
    yesPriceHint,
    noPriceRaw,
    sampleQtyRaw: 10000000,
    deployerSttBalance: (Number(sttWei) / 1e18).toFixed(6),
    deployerTusdcBalance: (Number(tusdcRaw) / 1e6).toFixed(6),
    discoveryBlock: Number(latest),
  };
  report.note =
    `series=${seriesName} (window ${windowSec}s), operator=${chosen.operatorId}, venue=${venueShort}, ` +
    `collateral=${collateral}, bestYesBid=${bestYesBid ?? null}, bestYesAsk=${bestYesAsk ?? null}, ` +
    `marketStatus=${Number(status)} (1=Trading), isResolved=${isResolved}, finalized=${binParams ? String(binFinalized) : 'n/a'}, ` +
    `acceptingOrders=${accepting}`;
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('FATAL:', e && e.message ? e.message : e);
  process.exit(3);
});