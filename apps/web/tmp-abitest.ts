import type { Abi } from 'viem';
import brainJson from './lib/abi/brain.json';
import vaultJson from './lib/abi/vault.json';

// Test 1: direct assignment
const brainAbi: Abi = brainJson;
const vaultAbi: Abi = vaultJson;

// Test 2: does the JSON type preserve literal discrimination?
type BrainEntry = (typeof brainJson)[number];
type Ev = Extract<BrainEntry, { type: 'event' }>;
const ev: Ev | undefined = brainJson.find((e) => e.type === 'event' && e.name === 'AuditEvent');

console.log(brainAbi.length, vaultAbi.length, ev?.name);
export {};
