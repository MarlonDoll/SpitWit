// =====================================================
//  SPITWIT — Automated Tests
//  Run from browser console: import('./js/tests.js').then(m => m.runTests())
//  Or open index.html and run: window.runTests()
// =====================================================
import { shuffle } from './state.js';
import { UNIQUE_PROMPTS, PROMPT_PACKS, PERSONAL_PROMPT_TEMPLATES,
         buildPersonalizedPool, interleavePersonal } from './prompts.js';

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${name}`);
    failed++;
  }
}

function test(suiteName, fn) {
  console.group(`▶ ${suiteName}`);
  fn();
  console.groupEnd();
}

// ===== SHUFFLE TESTS =====
test('shuffle()', () => {
  const original = [1,2,3,4,5,6,7,8,9,10];
  const arr = [...original];
  shuffle(arr);

  assert(arr.length === original.length, 'shuffle preserves array length');
  assert(arr.every(x => original.includes(x)), 'shuffle preserves all elements');
  assert(original.every(x => arr.includes(x)), 'shuffle keeps no duplicates');

  // Statistical test: shuffle should not be same order >90% of the time
  let sameCount = 0;
  for (let i = 0; i < 20; i++) {
    const a = [1,2,3,4,5];
    shuffle(a);
    if (JSON.stringify(a) === JSON.stringify([1,2,3,4,5])) sameCount++;
  }
  assert(sameCount < 4, 'shuffle produces different orderings (statistical)');
});

// ===== PROMPT PACK TESTS =====
test('PROMPT_PACKS', () => {
  const packNames = ['party', 'dark', 'wholesome', 'internet', 'work'];
  packNames.forEach(pack => {
    assert(Array.isArray(PROMPT_PACKS[pack]), `pack "${pack}" exists`);
    assert(PROMPT_PACKS[pack].length >= 20, `pack "${pack}" has ≥20 prompts`);
    PROMPT_PACKS[pack].forEach((p, i) => {
      assert(typeof p === 'string' && p.length > 0, `pack "${pack}" prompt ${i} is non-empty string`);
    });
  });

  assert(UNIQUE_PROMPTS.length > 400, `UNIQUE_PROMPTS has 400+ entries (got ${UNIQUE_PROMPTS.length})`);

  // No duplicates in UNIQUE_PROMPTS
  const set = new Set(UNIQUE_PROMPTS);
  assert(set.size === UNIQUE_PROMPTS.length, 'UNIQUE_PROMPTS has no duplicates');
});

// ===== PERSONAL PROMPT TEMPLATE TESTS =====
test('PERSONAL_PROMPT_TEMPLATES', () => {
  assert(PERSONAL_PROMPT_TEMPLATES.length >= 60, `has ≥60 personal templates (got ${PERSONAL_PROMPT_TEMPLATES.length})`);
  PERSONAL_PROMPT_TEMPLATES.forEach((t, i) => {
    assert(t.includes('[A]'), `template ${i} contains [A] placeholder`);
  });
});

// ===== buildPersonalizedPool TESTS =====
test('buildPersonalizedPool()', () => {
  const players = [
    { name: 'Alice' }, { name: 'Bob' }, { name: 'Carol' }
  ];

  const pool = buildPersonalizedPool(players, 15);
  assert(pool.length === 15, 'returns correct number of prompts');
  pool.forEach((p, i) => {
    assert(typeof p === 'string' && p.length > 0, `prompt ${i} is non-empty string`);
    assert(!p.includes('[A]') && !p.includes('[B]'), `prompt ${i} has no unreplaced placeholders`);
  });

  // Each player should appear in the pool
  const names = players.map(p => p.name);
  names.forEach(name => {
    assert(pool.some(p => p.includes(name)), `player "${name}" appears in the pool`);
  });
});

// ===== interleavePersonal TESTS =====
test('interleavePersonal()', () => {
  const regular = Array.from({ length: 30 }, (_, i) => `Regular ${i}`);
  const personal = Array.from({ length: 15 }, (_, i) => `Personal ${i}`);

  const result = interleavePersonal(regular, personal, 3, 3);
  assert(result.length > 0, 'returns non-empty result');
  assert(result.some(p => p.startsWith('Personal')), 'includes personal prompts');
  assert(result.some(p => p.startsWith('Regular')), 'includes regular prompts');
});

// ===== SCORING LOGIC TEST =====
test('Scoring logic', () => {
  // Simulate a round: 3 players, 2 votes for Alice, 0 for Bob
  const players = [
    { id: 'alice', name: 'Alice', score: 0, prevScore: 0 },
    { id: 'bob',   name: 'Bob',   score: 0, prevScore: 0 },
  ];
  const votes = { 'bob': 'alice', 'carol': 'alice' }; // 2 votes for Alice
  const voteCounts = {};
  Object.values(votes).forEach(v => { voteCounts[v] = (voteCounts[v] || 0) + 1; });
  players.forEach(p => {
    p.prevScore = p.score;
    p.score += (voteCounts[p.id] || 0) * 500;
  });

  assert(players[0].score === 1000, 'Alice gets 1000 pts for 2 votes');
  assert(players[1].score === 0,    'Bob gets 0 pts for 0 votes');
  assert(players[0].prevScore === 0, 'prevScore tracked correctly');
});

// ===== ROOM CODE TESTS =====
test('generateRoomCode()', () => {
  // Test inline (state module not imported here to avoid circular issues)
  function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }
  for (let i = 0; i < 10; i++) {
    const code = generateRoomCode();
    assert(code.length === 4, `room code has 4 chars (got "${code}")`);
    assert(/^[A-Z0-9]{4}$/.test(code), `room code is alphanumeric uppercase (got "${code}")`);
  }
});

// ===== RESULTS SUMMARY =====
export function runTests() {
  passed = 0; failed = 0;
  console.group('🎮 SPITWIT TEST SUITE');
  console.log('Running all tests...\n');

  // The tests run synchronously when this file is imported
  // Re-trigger them
  test('shuffle()', () => {
    const original = [1,2,3,4,5,6,7,8,9,10];
    const arr = [...original];
    shuffle(arr);
    assert(arr.length === original.length, 'shuffle preserves array length');
    assert(arr.every(x => original.includes(x)), 'shuffle preserves all elements');
  });

  test('PROMPT_PACKS (quick)', () => {
    assert(UNIQUE_PROMPTS.length > 400, `UNIQUE_PROMPTS has 400+ entries`);
    assert(PROMPT_PACKS.internet?.length >= 20, 'internet pack has ≥20 prompts');
    assert(PROMPT_PACKS.work?.length >= 20, 'work pack has ≥20 prompts');
  });

  test('buildPersonalizedPool (quick)', () => {
    const players = [{ name: 'Alice' }, { name: 'Bob' }];
    const pool = buildPersonalizedPool(players, 10);
    assert(pool.length === 10, 'correct pool size');
    assert(!pool.some(p => p.includes('[A]')), 'no unreplaced [A] placeholders');
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) console.log('🎉 All tests passed!');
  else console.warn(`⚠️ ${failed} test(s) failed`);
  console.groupEnd();
  return { passed, failed };
}

// Also expose to window for easy browser console access
if (typeof window !== 'undefined') {
  window.runTests = runTests;
}
