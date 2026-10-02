// =====================================================
//  SPITWIT — Connection Diagnostics
// =====================================================
//
//  WHY THIS EXISTS
//  ---------------
//  Adding TURN servers was supposed to fix the "stuck on Connecting..." bug and
//  it did not — players still failed at a real party. The problem both times was
//  that nobody could see *which* step was failing. WebRTC fails silently: ICE
//  gives up without an error, and the join screen could only report "could not
//  connect", which blamed the room code for a network problem.
//
//  This runs the same three steps a join does, separately, and says which one
//  broke. Run it on the machine that cannot connect and the answer is in the
//  report rather than in a guess.
// =====================================================
import { iceServers, peerJsReady, peerIdForRoom } from './net-config.js';

const GATHER_MS = 9000;
const BROKER_MS = 12000;

// Step 1: can the browser gather the candidate types a connection needs?
//   host  — always present, means nothing on its own
//   srflx — STUN worked; the network told us our public address
//   relay — TURN worked; we have a path that survives a symmetric NAT
// A player behind mobile/corporate NAT needs `relay`. No relay, no game.
export function gatherCandidates(servers, timeoutMs = GATHER_MS) {
  return new Promise(resolve => {
    const types = new Set();
    const errors = [];
    let pc;
    try {
      pc = new RTCPeerConnection({ iceServers: servers, iceCandidatePoolSize: 0 });
    } catch (e) {
      resolve({ types: [], errors: ['Could not create a peer connection: ' + e.message] });
      return;
    }
    const done = () => {
      try { pc.close(); } catch (e) {}
      resolve({ types: [...types], errors: [...new Set(errors)].slice(0, 4) });
    };
    pc.onicecandidate = (e) => {
      if (!e.candidate) { done(); return; }           // null candidate = gathering finished
      const m = /\btyp (\w+)/.exec(e.candidate.candidate || '');
      if (m) types.add(m[1]);
    };
    pc.onicecandidateerror = (e) => {
      // 701 is "could not reach this server at all"; 401/403 mean the
      // credentials were refused, which is what a retired free relay does.
      const url = e.url || '(unknown server)';
      errors.push(`${url} → ${e.errorCode}${e.errorText ? ' ' + e.errorText : ''}`);
    };
    try {
      pc.createDataChannel('spitwit-probe');
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(e => errors.push('offer: ' + e.message));
    } catch (e) { errors.push('probe: ' + e.message); }
    setTimeout(done, timeoutMs);
  });
}

// Step 2: is the signalling server reachable? This is a separate failure from
// ICE — the broker can be fine while the peer-to-peer path is dead, which is
// exactly the case that looked like a bad room code.
function checkBroker() {
  return new Promise(resolve => {
    const started = Date.now();
    let peer, settled = false;
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      try { peer && peer.destroy(); } catch (e) {}
      resolve({ ok, detail, ms: Date.now() - started });
    };
    try {
      peer = new window.Peer(undefined, { debug: 0 });
    } catch (e) { finish(false, e.message); return; }
    peer.on('open', () => finish(true, 'registered'));
    peer.on('error', (err) => finish(false, (err && (err.type || err.message)) || 'unknown error'));
    setTimeout(() => finish(false, 'timed out'), BROKER_MS);
  });
}

// Step 3 (optional): is a specific room actually reachable from here? Separates
// "the host's room does not exist" from "we cannot build a path to it".
function checkRoom(code) {
  return new Promise(resolve => {
    let peer, settled = false;
    const finish = (state, detail) => {
      if (settled) return;
      settled = true;
      try { peer && peer.destroy(); } catch (e) {}
      resolve({ state, detail });
    };
    try { peer = new window.Peer(undefined, { debug: 0, config: { iceServers: iceServers() } }); }
    catch (e) { finish('error', e.message); return; }
    peer.on('open', () => {
      const conn = peer.connect(peerIdForRoom(code), { reliable: true });
      const onOpen = () => finish('connected', 'data channel opened');
      if (conn.open) onOpen(); else conn.on('open', onOpen);
      conn.on('error', (e) => finish('error', (e && e.message) || 'connection error'));
    });
    peer.on('error', (err) => {
      const t = (err && err.type) || '';
      if (t === 'peer-unavailable') finish('no-such-room', 'the broker has no room with that code');
      else finish('error', t || (err && err.message) || 'unknown');
    });
    setTimeout(() => finish('timeout', 'no data channel after 20s — ICE could not build a path'), 20000);
  });
}

// Run everything and turn it into something a person can read and paste back.
export async function runDiagnostics(roomCode, onProgress = () => {}) {
  const report = { when: new Date().toISOString(), ua: navigator.userAgent, steps: {} };

  onProgress('Loading the connection library…');
  report.steps.library = { ok: await peerJsReady() };
  if (!report.steps.library.ok) {
    report.verdict = 'The connection library could not load. A network that blocks CDNs will do this.';
    report.fixable = 'Try mobile data, or a different network.';
    return report;
  }

  onProgress('Checking the signalling server…');
  report.steps.broker = await checkBroker();

  onProgress('Checking what network paths are available… (about 10 seconds)');
  const servers = iceServers();
  const all = await gatherCandidates(servers);
  report.steps.candidates = all;

  // Per-server detail, so a dead relay can be named rather than inferred.
  const turnOnly = servers.filter(s => {
    const u = Array.isArray(s.urls) ? s.urls[0] : s.urls;
    return /^turns?:/.test(u);
  });
  report.steps.perServer = [];
  for (const s of turnOnly) {
    const label = Array.isArray(s.urls) ? s.urls[0] : s.urls;
    onProgress(`Testing relay ${label}…`);
    const r = await gatherCandidates([s], 6000);
    report.steps.perServer.push({ server: label, relay: r.types.includes('relay'), errors: r.errors });
  }

  if (roomCode) {
    onProgress(`Trying to reach room ${roomCode}…`);
    report.steps.room = await checkRoom(roomCode);
  }

  const hasSrflx = all.types.includes('srflx');
  const hasRelay = all.types.includes('relay');
  const workingRelays = report.steps.perServer.filter(s => s.relay).length;

  if (!report.steps.broker.ok) {
    report.verdict = 'Could not reach the signalling server, so no game can be found from here.';
    report.fixable = 'Usually a firewall or an outage. Try another network.';
  } else if (hasRelay) {
    report.verdict = `Relays are working (${workingRelays} of ${turnOnly.length}). This device should be able to connect.`;
    report.fixable = report.steps.room && report.steps.room.state !== 'connected'
      ? `But reaching room ${roomCode} failed: ${report.steps.room.detail}`
      : 'If a game still fails, the problem is on the host side.';
  } else if (hasSrflx) {
    // The exact case that stranded people twice now.
    report.verdict = 'STUN works but NO RELAY IS AVAILABLE. On a home network this is usually fine. '
      + 'On mobile data, office, school or guest Wi-Fi, a relay is required and this device will not connect.';
    report.fixable = 'Every configured relay failed — see the per-relay lines below. '
      + 'The durable fix is your own TURN credentials (paste them into Relay settings on the host screen).';
  } else {
    report.verdict = 'This network blocks even basic STUN, so WebRTC cannot work here at all.';
    report.fixable = 'Try mobile data, or a different network.';
  }
  return report;
}

export function formatReport(r) {
  const L = [];
  L.push('SPITWIT CONNECTION REPORT');
  L.push(r.when);
  L.push('');
  L.push('VERDICT: ' + (r.verdict || '(incomplete)'));
  if (r.fixable) L.push('→ ' + r.fixable);
  L.push('');
  L.push('Library loaded:      ' + (r.steps.library?.ok ? 'yes' : 'NO'));
  if (r.steps.broker) {
    L.push('Signalling server:   ' + (r.steps.broker.ok ? `ok (${r.steps.broker.ms}ms)` : `FAILED — ${r.steps.broker.detail}`));
  }
  if (r.steps.candidates) {
    const t = r.steps.candidates.types;
    L.push('Candidate types:     ' + (t.join(', ') || 'none'));
    L.push('  host  (local)      ' + (t.includes('host') ? 'yes' : 'NO'));
    L.push('  srflx (STUN)       ' + (t.includes('srflx') ? 'yes' : 'NO'));
    L.push('  relay (TURN)       ' + (t.includes('relay') ? 'yes' : 'NO  <-- needed on strict networks'));
  }
  if (r.steps.perServer?.length) {
    L.push('');
    L.push('Relays:');
    r.steps.perServer.forEach(s => {
      L.push(`  ${s.relay ? 'OK  ' : 'FAIL'} ${s.server}`);
      s.errors.forEach(e => L.push(`         ${e}`));
    });
  }
  if (r.steps.room) L.push('', `Room check:          ${r.steps.room.state} — ${r.steps.room.detail}`);
  L.push('', r.ua);
  return L.join('\n');
}
