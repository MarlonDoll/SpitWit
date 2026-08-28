// =====================================================
//  SPITWIT — Automated Tests
//  Run from browser console: import('./js/tests.js').then(m => m.runTests())
//  Or open index.html and run: window.runTests()
// =====================================================
import { shuffle } from './state.js';
import { UNIQUE_PROMPTS, PROMPT_PACKS, PERSONAL_PROMPT_TEMPLATES,
         buildPersonalizedPool, interleavePersonal } from './prompts.js';
import { generateRoomCode, normalizeRoomCode, peerIdForRoom,
         ROOM_CODE_LENGTH, iceServers } from './net-config.js';

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
  const AMBIGUOUS = /[ILOU]/;
  let sawAmbiguous = false;
  for (let i = 0; i < 500; i++) {
    const code = generateRoomCode();
    if (code.length !== ROOM_CODE_LENGTH) {
      assert(false, `room code has ${ROOM_CODE_LENGTH} chars (got "${code}")`);
      return;
    }
    if (!/^[0-9A-Z]+$/.test(code)) {
      assert(false, `room code is alphanumeric uppercase (got "${code}")`);
      return;
    }
    if (AMBIGUOUS.test(code)) sawAmbiguous = true;
  }
  assert(true, `room code always has ${ROOM_CODE_LENGTH} uppercase alphanumeric chars`);
  // I/1, L/1, O/0 are indistinguishable when a code is read aloud or squinted
  // at across a room, which is how a mistyped code became a "connection error".
  assert(!sawAmbiguous, 'room codes never contain the ambiguous I, L, O or U');
});

test('normalizeRoomCode()', () => {
  assert(normalizeRoomCode('7k3m') === '7K3M', 'uppercases input');
  assert(normalizeRoomCode(' 7K3M ') === '7K3M', 'strips surrounding whitespace');
  assert(normalizeRoomCode('7K-3M') === '7K3M', 'strips punctuation');
  assert(normalizeRoomCode('') === '', 'empty input stays empty');
  assert(normalizeRoomCode(null) === '', 'null input is handled');
  assert(normalizeRoomCode('7K3MXYZ') === '7K3M', 'truncates to the code length');

  // The confusable characters all fold onto the one the alphabet actually uses,
  // so a player who reads O for 0 or l for 1 still lands in the right room.
  assert(normalizeRoomCode('1H10') === normalizeRoomCode('IHIO'), 'I folds onto 1 and O onto 0');
  assert(normalizeRoomCode('1H10') === normalizeRoomCode('lhlo'), 'lowercase l folds onto 1');
  assert(normalizeRoomCode('1H10') === '1H10', 'canonical form is the generated alphabet');

  // Generated codes must survive a round trip untouched.
  for (let i = 0; i < 200; i++) {
    const code = generateRoomCode();
    if (normalizeRoomCode(code) !== code) {
      assert(false, `normalize is identity on generated codes (got "${normalizeRoomCode(code)}" from "${code}")`);
      return;
    }
  }
  assert(true, 'normalize is the identity on generated codes');
});

test('peerIdForRoom()', () => {
  assert(peerIdForRoom('7K3M') === 'spitwit-7K3M', 'peer id is namespaced by room code');
  for (let i = 0; i < 50; i++) {
    const id = peerIdForRoom(generateRoomCode());
    // PeerJS ids travel in URLs, so anything outside [A-Za-z0-9_-] breaks them.
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      assert(false, `peer id is URL-safe (got "${id}")`);
      return;
    }
  }
  assert(true, 'peer ids are URL-safe');
});

// ===== ICE CONFIG TESTS =====
test('iceServers()', () => {
  const servers = iceServers();
  const urls = servers.flatMap(s => Array.isArray(s.urls) ? s.urls : [s.urls]);

  assert(servers.length > 0, 'ICE server list is not empty');
  assert(urls.some(u => u.startsWith('stun:')), 'includes at least one STUN server');

  // Without TURN, players behind a symmetric NAT (mobile data, corporate or
  // guest Wi-Fi, VPNs) can never open a data channel and hang on "Connecting".
  const turn = urls.filter(u => u.startsWith('turn:') || u.startsWith('turns:'));
  assert(turn.length > 0, 'includes at least one TURN relay');
  assert(turn.some(u => u.includes(':443')), 'includes a TURN relay on port 443 for strict firewalls');
  assert(turn.some(u => u.includes('transport=tcp')), 'includes a TCP TURN relay for UDP-blocking networks');

  const credentialed = servers.filter(s => {
    const u = Array.isArray(s.urls) ? s.urls[0] : s.urls;
    return u.startsWith('turn:') || u.startsWith('turns:');
  });
  assert(credentialed.every(s => s.username && s.credential),
         'every TURN entry carries credentials');
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

  test('room codes (quick)', () => {
    const code = generateRoomCode();
    assert(code.length === ROOM_CODE_LENGTH, 'generated code has the right length');
    assert(normalizeRoomCode(code) === code, 'generated code normalizes to itself');
  });

  test('ICE config (quick)', () => {
    const urls = iceServers().flatMap(s => Array.isArray(s.urls) ? s.urls : [s.urls]);
    assert(urls.some(u => u.startsWith('turn:') || u.startsWith('turns:')),
           'a TURN relay is configured');
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
