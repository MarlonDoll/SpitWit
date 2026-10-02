// =====================================================
//  SPITWIT — Automated Tests
//  Run from browser console: import('./js/tests.js').then(m => m.runTests())
//  Or open index.html and run: window.runTests()
// =====================================================
import { shuffle, votingSeconds } from './state.js';
import { UNIQUE_PROMPTS, PROMPT_PACKS, PERSONAL_PROMPT_TEMPLATES,
         buildPersonalizedPool } from './prompts.js';
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

// ===== VOTING TIME TESTS =====
test('votingSeconds()', () => {
  assert(votingSeconds(20, 4) === 20, 'small rounds keep the host\'s chosen time');
  assert(votingSeconds(20, 6) === 20, 'six answers still fit the base time');
  assert(votingSeconds(20, 19) > 40, `a full room gets real reading time (got ${votingSeconds(20, 19)}s)`);
  assert(votingSeconds(20, 19) >= votingSeconds(20, 10), 'more answers never means less time');
  assert(votingSeconds(20, 100) <= 80, 'growth is capped so a huge room cannot stall the game');
  assert(votingSeconds(undefined, 8) > 0, 'missing base time falls back to a sane default');
  assert(Number.isInteger(votingSeconds(20, 19)), 'returns whole seconds');
});

// ===== PERSONAL TEMPLATE LIBRARY =====
test('PERSONAL_PROMPT_TEMPLATES library', () => {
  const t = PERSONAL_PROMPT_TEMPLATES;
  const dupes = t.filter((x, i, a) => a.indexOf(x) !== i);
  assert(dupes.length === 0, `no duplicate templates (found ${JSON.stringify(dupes)})`);
  assert(t.every(x => x.includes('[A]')), 'every template names [A]');
  assert(!t.some(x => x.includes('[B]') && !x.includes('[A]')), 'no template uses [B] without [A]');
  assert(!t.some(x => /\[C\]|\[D\]/.test(x)), 'no placeholders the generator cannot fill');

  // Pair templates are what the generator reaches for first in a big room, so a
  // thin supply means the same few prompts every game night.
  const pairs = t.filter(x => x.includes('[B]'));
  assert(pairs.length >= 20, `enough two-name templates to stay fresh (${pairs.length})`);
  assert(t.every(x => x.trim().length > 10), 'no stub templates');
});

// ===== PERSONALIZATION TESTS =====
test('buildPersonalizedPool() coverage', () => {
  const players = Array.from({ length: 19 }, (_, i) => ({ name: 'Player' + i }));
  const pool = buildPersonalizedPool(players, 3);
  assert(pool.length === 3, 'builds exactly the number of prompts asked for');
  assert(!pool.some(p => /\[A\]|\[B\]/.test(p)), 'no unreplaced placeholders');

  // Everyone should be named once before anyone is named twice: with more
  // players than rounds, repeats mean someone else never comes up at all.
  const named = new Set();
  pool.forEach(q => players.forEach(p => { if (new RegExp('\\b' + p.name + '\\b').test(q)) named.add(p.name); }));
  assert(named.size >= 3, `3 prompts name at least 3 different people (named ${named.size})`);

  const big = buildPersonalizedPool(players, 40);
  assert(big.every(q => unsubstitute(q, players.map(p => p.name)) !== null),
         'every generated prompt maps back to a real template');
});

// Turn a finished prompt back into its template by replacing the first player
// named with [A] and the second with [B], then look it up. A prompt built from
// a two-name template but filled with one name cannot map back, so this catches
// self-pairing exactly — unlike counting name occurrences, which trips over the
// templates that legitimately use [A] twice.
function unsubstitute(prompt, names) {
  const found = [];
  const re = new RegExp('\\b(' + names.join('|') + ')\\b', 'g');
  let mm;
  while ((mm = re.exec(prompt)) !== null) if (!found.includes(mm[1])) found.push(mm[1]);
  if (!found.length) return null;
  let shape = prompt;
  shape = shape.replace(new RegExp('\\b' + found[0] + '\\b', 'g'), '[A]');
  if (found[1]) shape = shape.replace(new RegExp('\\b' + found[1] + '\\b', 'g'), '[B]');
  return PERSONAL_PROMPT_TEMPLATES.includes(shape) ? shape : null;
}

test('buildPersonalizedPool() never pairs someone with themselves', () => {
  // A one-player game is reachable through the 'personalized' prompt pack,
  // which has no minimum player count. [B] used to fall back to [A], giving
  // "What Solo and Solo would name their band".
  const solo = buildPersonalizedPool([{ name: 'Solo' }], 30);
  const soloShapes = solo.map(q => unsubstitute(q, ['Solo']));
  assert(soloShapes.every(sh => sh !== null), 'one-player prompts map back to real templates');
  assert(soloShapes.every(sh => sh && !sh.includes('[B]')),
         'a lone player is never handed a two-name template');

  const pair = buildPersonalizedPool([{ name: 'Ash' }, { name: 'Bo' }], 30);
  const pairShapes = pair.map(q => unsubstitute(q, ['Ash', 'Bo']));
  assert(pairShapes.every(sh => sh !== null), 'two-player prompts map back to real templates');
  // Any two-name prompt must actually name both of them.
  const twoName = pair.filter((q, i) => pairShapes[i] && pairShapes[i].includes('[B]'));
  assert(twoName.every(q => /\bAsh\b/.test(q) && /\bBo\b/.test(q)),
         'a two-name prompt names two different players');
});

test('buildPersonalizedPool() with tiny groups', () => {
  const two = buildPersonalizedPool([{ name: 'Ash' }, { name: 'Bo' }], 6);
  assert(two.length === 6, 'two players still fill the round count');
  assert(!two.some(p => /\[A\]|\[B\]/.test(p)), 'no unreplaced placeholders with 2 players');

  const one = buildPersonalizedPool([{ name: 'Solo' }], 3);
  assert(one.length === 3, 'a single player does not hang the generator');
  assert(!one.some(p => /\[A\]|\[B\]/.test(p)), 'no unreplaced placeholders with 1 player');
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

  test('voting time (quick)', () => {
    assert(votingSeconds(20, 4) === 20, 'base time kept for a small round');
    assert(votingSeconds(20, 19) > 40, 'full room gets more reading time');
  });

  test('personalization (quick)', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ name: 'P' + i }));
    const pool = buildPersonalizedPool(players, 3);
    assert(pool.length === 3 && !pool.some(p => /\[A\]|\[B\]/.test(p)), 'personal prompts build cleanly');
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
