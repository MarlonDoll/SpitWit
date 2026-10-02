// =====================================================
//  SPITWIT — Network Configuration (ICE / room codes)
// =====================================================
//
//  WHY THIS FILE EXISTS
//  --------------------
//  The original code called `new Peer(id, { debug: 0 })`, which leaves PeerJS
//  on its defaults: the free public broker plus Google STUN and *no TURN*.
//  STUN only works when at least one side can be reached directly. Anyone on
//  a mobile network (CGNAT), a corporate/guest Wi-Fi, or a VPN sits behind a
//  symmetric NAT where that is impossible, so ICE quietly fails, the data
//  channel never opens, and PeerJS emits no error at all — the player just
//  watches "Connecting..." forever. That is the failure most players hit.
//
//  Adding TURN relays gives ICE a fallback path that works from anywhere,
//  including networks that only allow outbound 443.
// =====================================================

// Free public relays. `turn:...:443?transport=tcp` and `turns:` matter most:
// they look like ordinary HTTPS traffic and survive restrictive firewalls.
const DEFAULT_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302',
           'stun:stun1.l.google.com:19302',
           'stun:stun.cloudflare.com:3478'] },
  // Both the old and current OpenRelay hostnames. One of these is likely dead —
  // the first TURN fix shipped only the old one and players still could not
  // connect — and ICE just ignores a server it cannot reach, so listing several
  // independent endpoints is strictly better than betting on one.
  { urls: 'turn:staticauth.openrelay.metered.ca:80',
    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:staticauth.openrelay.metered.ca:443',
    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:staticauth.openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject', credential: 'openrelayproject' },
];

const ICE_OVERRIDE_KEY = 'spitwit-ice-servers';

// Lets a host swap in their own TURN credentials without a redeploy, either
// via ?ice=<url-encoded JSON> once or by seeding localStorage. Public relays
// are shared and rate-limited, so a private one is worth having for big games.
function loadIceOverride() {
  try {
    const fromUrl = new URLSearchParams(location.search).get('ice');
    if (fromUrl) {
      const parsed = JSON.parse(decodeURIComponent(fromUrl));
      if (Array.isArray(parsed) && parsed.length) {
        localStorage.setItem(ICE_OVERRIDE_KEY, JSON.stringify(parsed));
        return parsed;
      }
    }
    const stored = localStorage.getItem(ICE_OVERRIDE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch (e) { /* fall through to defaults */ }
  return null;
}

export function iceServers() {
  return loadIceOverride() || DEFAULT_ICE_SERVERS;
}

export function hasIceOverride() {
  return loadIceOverride() !== null;
}

// Returns an error string, or null on success.
export function saveIceOverride(text) {
  const raw = (text || '').trim();
  if (!raw) return 'Paste a JSON array of ICE servers.';
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return 'That is not valid JSON: ' + e.message; }
  if (!Array.isArray(parsed) || !parsed.length) return 'Expected a non-empty JSON array.';
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') return 'Every entry must be an object.';
    const u = Array.isArray(entry.urls) ? entry.urls[0] : entry.urls;
    if (typeof u !== 'string' || !/^(stun|stuns|turn|turns):/.test(u)) {
      return 'Every entry needs a "urls" starting with stun: or turn:.';
    }
    if (/^turns?:/.test(u) && (!entry.username || !entry.credential)) {
      return 'TURN entries need a username and credential.';
    }
  }
  try { localStorage.setItem(ICE_OVERRIDE_KEY, JSON.stringify(parsed)); }
  catch (e) { return 'Could not save: ' + e.message; }
  return null;
}

export function clearIceOverride() {
  try { localStorage.removeItem(ICE_OVERRIDE_KEY); } catch (e) {}
}

// Shared PeerJS options. `iceCandidatePoolSize` warms candidates up front so
// the relay path is ready the moment a connection is attempted.
export function peerOptions() {
  return {
    debug: 0,
    config: {
      iceServers: iceServers(),
      iceCandidatePoolSize: 4,
    },
  };
}

// Data channels are created with `ordered: !!options.reliable`, and PeerJS
// defaults that to false. Unordered delivery let 'game-start' and 'prompt'
// overtake each other and could interleave chunks of a large 'player-list'.
export const CONNECT_OPTIONS = { reliable: true };

// ===== ROOM CODES =====
// Crockford base32: no I, L, O or U, so a spoken or squinted-at code is not
// ambiguous. The old codes came from Math.random().toString(36), which happily
// produced things like "1HIO" where 1/I and O/0 are indistinguishable — a
// mistyped code reads to the joining player as a connection failure.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export function generateRoomCode() {
  const n = CODE_ALPHABET.length;
  let code = '';
  const rng = globalThis.crypto;
  if (rng && rng.getRandomValues) {
    const bytes = new Uint8Array(ROOM_CODE_LENGTH);
    rng.getRandomValues(bytes);
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[bytes[i] % n];
  } else {
    // The old generator sliced Math.random().toString(36), which could return
    // fewer than 4 characters when the random value was short.
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * n)];
  }
  return code;
}

// Folds the characters people actually mistype back onto the alphabet, so
// "1HlO" and "IH10" both resolve to the same room as "1H10".
export function normalizeRoomCode(raw) {
  return (raw || '')
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
    .replace(/[^0-9A-Z]/g, '')
    .split('')
    .filter(ch => CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

export function peerIdForRoom(code) {
  return 'spitwit-' + code;
}

// ===== PEERJS LOADING =====
// index.html pulls PeerJS from a CDN with `defer`, so window.Peer may not exist
// yet when someone clicks straight through — and on networks that block the CDN
// outright it never appears. Either way the old code threw a bare ReferenceError
// inside the click handler, leaving the player on "Connecting..." with nothing
// to go on. Wait for the library, try a second CDN, then report it honestly.
const PEERJS_FALLBACK_SRC = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.2/dist/peerjs.min.js';
const PEERJS_WAIT_MS = 8000;

let peerJsPromise = null;

function waitForPeer(timeoutMs) {
  return new Promise(resolve => {
    if (typeof window.Peer !== 'undefined') { resolve(true); return; }
    const deadline = Date.now() + timeoutMs;
    const poll = setInterval(() => {
      if (typeof window.Peer !== 'undefined') { clearInterval(poll); resolve(true); }
      else if (Date.now() > deadline) { clearInterval(poll); resolve(false); }
    }, 100);
  });
}

export function peerJsReady() {
  if (typeof window.Peer !== 'undefined') return Promise.resolve(true);
  if (peerJsPromise) return peerJsPromise;

  peerJsPromise = waitForPeer(PEERJS_WAIT_MS).then(ok => {
    if (ok) return true;
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = PEERJS_FALLBACK_SRC;
      script.onload = () => resolve(typeof window.Peer !== 'undefined');
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
      setTimeout(() => resolve(typeof window.Peer !== 'undefined'), PEERJS_WAIT_MS);
    });
  }).then(ok => {
    if (!ok) peerJsPromise = null;  // allow a later retry to try again
    return ok;
  });

  return peerJsPromise;
}

export const PEERJS_LOAD_ERROR =
  'Could not load the connection library. A network that blocks CDNs (school, office or guest Wi-Fi) will do this — try mobile data or a different network.';
