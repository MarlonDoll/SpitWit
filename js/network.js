// =====================================================
//  SPITWIT — Networking (PeerJS)
// =====================================================
import { state, notify, generateMsgId, votingSeconds } from './state.js';
import { peerOptions, CONNECT_OPTIONS, generateRoomCode, normalizeRoomCode,
         peerIdForRoom, ROOM_CODE_LENGTH, peerJsReady, PEERJS_LOAD_ERROR } from './net-config.js';
import { SFX } from './audio.js';
import { renderLobbyPlayers, renderWaitPlayers, showScreen,
         startAnsweringPhase, startVotingPhase, showResultsPhase,
         showScoreboardPhase, showWinnerPhase } from './ui.js';
import { trackAnswerForTV } from './tv.js';
// checkAllAnswered, checkAllVoted, leaveGame imported from game.js below (circular ok in ES6 modules)
import { checkAllAnswered, checkAllVoted, leaveGame } from './game.js';

// ===== TIMING =====
const ACK_TIMEOUT_MS       = 3000;
const MAX_RETRIES          = 3;
const PEER_OPEN_TIMEOUT_MS = 15000;  // broker handshake (signalling server)
const CONN_OPEN_TIMEOUT_MS = 20000;  // ICE negotiation — the step that silently hangs
const JOIN_ATTEMPTS        = 4;
const HEARTBEAT_MS         = 4000;
const CONTACT_TIMEOUT_MS   = 16000;  // no traffic for this long => the link is dead
const SYNC_REQUEST_MIN_GAP = 4000;

// ===== BROADCAST HELPERS =====
export function broadcastToAll(msg) {
  state.connections.forEach(c => {
    if (!c.open) return;   // half-open channels swallow sends; skip rather than pretend
    try { c.send(msg); } catch(e) {}
  });
}

export function sendToHost(msg) {
  if (state.hostConn && state.hostConn.open) {
    try { state.hostConn.send(msg); return true; } catch(e) {}
  }
  return false;
}

// Anything that stops the network invalidates in-flight callbacks from the
// previous session: timeouts, retry chains and peer events all check the epoch
// they were created under before touching shared state.
export function bumpEpoch() {
  state.netEpoch++;
  stopHeartbeat();
  return state.netEpoch;
}

function stale(epoch) {
  return epoch !== state.netEpoch;
}

function destroyPeer(peer) {
  if (!peer) return;
  try { peer.removeAllListeners && peer.removeAllListeners(); } catch(e) {}
  try { peer.destroy(); } catch(e) {}
}

// ===== RELIABLE MESSAGING (ACK + retry for answer/vote) =====
export function sendReliable(msg) {
  const msgId = generateMsgId();
  const msgWithId = { ...msg, msgId };
  attemptSend(msgWithId, msgId, 0);
}

function attemptSend(msgWithId, msgId, retryCount) {
  sendToHost(msgWithId);
  const timerId = setTimeout(() => {
    if (!state.pendingMessages[msgId]) return; // already acked
    if (retryCount < MAX_RETRIES) {
      attemptSend(msgWithId, msgId, retryCount + 1);
    } else {
      delete state.pendingMessages[msgId];
      notify('⚠️ Message may not have reached the host. Try resubmitting.');
    }
  }, ACK_TIMEOUT_MS);
  state.pendingMessages[msgId] = { timerId };
}

function handleAck(msgId) {
  const pending = state.pendingMessages[msgId];
  if (pending) {
    clearTimeout(pending.timerId);
    delete state.pendingMessages[msgId];
  }
}

// ===== HEARTBEAT =====
// WebRTC data channels can go silent without ever firing 'close' — the tab
// sleeps, the phone changes network, a relay drops the flow. Without traffic to
// watch, a player sits on "Connecting..." or "Waiting for the host" forever
// because nothing tells either side the link is gone. The host pings; the
// client replies and watches the clock.
export function startHeartbeat() {
  stopHeartbeat();
  const epoch = state.netEpoch;

  state.heartbeatInterval = setInterval(() => {
    if (stale(epoch)) { stopHeartbeat(); return; }
    const now = Date.now();

    if (state.isHost) {
      // The ping carries the phase so a client that missed a state broadcast
      // can notice it is out of step and ask for a resync.
      broadcastToAll({ type: 'ping', phase: state.phase, t: now });
      state.connections.forEach(conn => {
        if (conn.lastSeen && now - conn.lastSeen > CONTACT_TIMEOUT_MS) {
          conn.lastSeen = now; // don't re-fire every tick
          handlePlayerDisconnect(conn);
        }
      });
    } else if (state.hostConn) {
      sendToHost({ type: 'pong', t: now });
      if (state.lastHostContact && now - state.lastHostContact > CONTACT_TIMEOUT_MS) {
        state.lastHostContact = now;
        handleHostLinkLost();
      }
    }
  }, HEARTBEAT_MS);
}

export function stopHeartbeat() {
  if (state.heartbeatInterval) {
    clearInterval(state.heartbeatInterval);
    state.heartbeatInterval = null;
  }
}

// ===== HOST SETUP =====
export async function startHosting() {
  const name = document.getElementById('host-name').value.trim();
  if (!name) { alert('Enter your name first!'); return; }

  showScreen('screen-host-lobby');
  document.getElementById('room-code-display').textContent = '----';
  setHostStatus('Starting up...', 'waiting');

  if (!await peerJsReady()) {
    setHostStatus(PEERJS_LOAD_ERROR, 'error');
    return;
  }
  beginHosting(name, 0);
}

function beginHosting(name, retryCount) {
  const epoch = bumpEpoch();
  destroyPeer(state.peer);
  state.peer = null;

  state.isHost = true;
  state.myName = name;
  state.gameSettings = {
    rounds: parseInt(document.getElementById('num-rounds').value),
    answerTime: parseInt(document.getElementById('answer-time').value),
    voteTime: parseInt(document.getElementById('vote-time').value),
    promptPack: document.getElementById('prompt-pack').value,
    includeCustom: document.getElementById('include-custom').checked,
    customPrompts: [...state.customPrompts],
    blindVoting: document.getElementById('blind-voting').checked,
    readAloud: document.getElementById('read-aloud').checked,
    hostDisplay: document.getElementById('host-display-mode').checked,
    personalPrompts: document.getElementById('personal-prompts').checked,
  };

  const roomCode = generateRoomCode();
  const peerId = peerIdForRoom(roomCode);
  state.roomCode = roomCode;

  showScreen('screen-host-lobby');
  document.getElementById('room-code-display').textContent = roomCode;
  setHostStatus('Connecting...', 'waiting');

  const peer = new Peer(peerId, peerOptions());
  state.peer = peer;
  state.myId = peerId;
  state.players = [{ id: peerId, name, score: 0, prevScore: 0, disconnected: false }];

  // The broker handshake can hang with no error of its own.
  const openTimeout = setTimeout(() => {
    if (stale(epoch) || peer.open) return;
    if (retryCount < 3) {
      setHostStatus('Signalling server slow — retrying...', 'waiting');
      destroyPeer(peer);
      beginHosting(name, retryCount + 1);
    } else {
      setHostStatus('Could not reach the signalling server. Check your connection and try again.', 'error');
    }
  }, PEER_OPEN_TIMEOUT_MS);

  peer.on('open', () => {
    if (stale(epoch)) return;
    clearTimeout(openTimeout);
    setHostStatus('✓ Ready to accept players', 'connected');
    renderLobbyPlayers();
    startHeartbeat();
  });

  peer.on('connection', (conn) => {
    if (stale(epoch)) { try { conn.close(); } catch(e) {} return; }
    attachClientConn(conn);
  });

  peer.on('disconnected', () => {
    // Lost the broker but not the existing peers: reconnecting keeps the room
    // code alive so late players can still find it.
    if (stale(epoch) || peer.destroyed) return;
    setHostStatus('Signalling server dropped — reconnecting...', 'waiting');
    try { peer.reconnect(); } catch(e) {}
  });

  peer.on('error', (err) => {
    if (stale(epoch)) return;
    if (err.type === 'unavailable-id') {
      // Room code already taken (or a stale registration of ours). Take a new
      // one — but bounded, so a broker outage can't spin forever.
      clearTimeout(openTimeout);
      if (retryCount < 5) {
        destroyPeer(peer);
        beginHosting(name, retryCount + 1);
      } else {
        setHostStatus('Could not claim a room code. Please try again.', 'error');
      }
      return;
    }
    if (err.type === 'peer-unavailable') return;  // a player vanished; not fatal to the room
    if (err.type === 'network' || err.type === 'socket-error' || err.type === 'server-error') {
      setHostStatus('Network trouble — retrying...', 'waiting');
      try { peer.reconnect(); } catch(e) {}
      return;
    }
    clearTimeout(openTimeout);
    setHostStatus('Connection error: ' + (err.message || err.type), 'error');
  });
}

function setHostStatus(text, kind) {
  const el = document.getElementById('host-connection-status');
  if (!el) return;
  el.textContent = text;
  el.className = 'status-badge status-' + kind;
}

// Wire an incoming player connection.
//
// The handlers go on immediately rather than inside conn.on('open'). PeerJS can
// emit 'connection' for a channel that is *already* open, and an 'open' that has
// already fired never fires again — so the old code left such a connection with
// no 'data' listener at all. The player saw "Connected!", the host never saw
// their join, and they waited on "Waiting for the host to start..." forever.
function attachClientConn(conn) {
  const epoch = state.netEpoch;
  conn.lastSeen = Date.now();

  const register = () => {
    if (stale(epoch)) return;
    if (!state.connections.includes(conn)) state.connections.push(conn);
  };

  conn.on('data', (data) => {
    if (stale(epoch)) return;
    conn.lastSeen = Date.now();
    register();  // covers the case where 'open' fired before we got here
    handleClientMessage(conn, data);
  });
  conn.on('close', () => { if (!stale(epoch)) handlePlayerDisconnect(conn); });
  conn.on('error', () => { if (!stale(epoch)) handlePlayerDisconnect(conn); });

  if (conn.open) register(); else conn.on('open', register);
}

// ===== DISCONNECT HANDLING =====
export function handlePlayerDisconnect(conn) {
  state.connections = state.connections.filter(c => c !== conn);
  try { conn.close(); } catch(e) {}
  const player = state.players.find(p => p.id === conn.peer);
  if (!player) return;  // already replaced by a reconnect on a newer connection

  if (state.phase === 'lobby') {
    state.players = state.players.filter(p => p.id !== conn.peer);
    broadcastToAll({ type: 'player-list', players: state.players });
    renderLobbyPlayers();
    notify(`A player left the lobby`);
    return;
  }

  // Mid-game: keep player but mark disconnected so game isn't stuck
  player.disconnected = true;
  notify(`${player.name} disconnected 📡`);
  broadcastToAll({ type: 'player-list', players: state.players });
  renderLobbyPlayers();

  // Fill answer/vote so game doesn't stall
  if (state.phase === 'answering' && state.answers[conn.peer] === undefined) {
    state.answers[conn.peer] = '(disconnected)';
    checkAllAnswered();
  }
  if (state.phase === 'voting' && state.votes[conn.peer] === undefined) {
    state.votes[conn.peer] = null; // abstain
    checkAllVoted();
  }
}

// A reconnecting player arrives on a brand new connection. Drop any older one
// still bound to them, otherwise broadcasts keep going to a dead channel and
// its eventual 'close' marks the player disconnected again.
function dropStaleConnsFor(player, keepConn) {
  state.connections = state.connections.filter(c => {
    if (c === keepConn || c.peer !== player.previousId) return true;
    try { c.close(); } catch(e) {}
    return false;
  });
}

// ===== CLIENT MESSAGE HANDLER (host receives) =====
export function handleClientMessage(conn, data) {
  if (!data || typeof data !== 'object') return;

  // Always ACK messages with an ID
  if (data.msgId) {
    try { conn.send({ type: 'ack', msgId: data.msgId }); } catch(e) {}
  }

  if (data.type === 'pong') return;  // liveness only; lastSeen already refreshed

  if (data.type === 'sync-request') {
    const player = state.players.find(p => p.id === conn.peer);
    if (player) sendReconnectState(conn, player);
    return;
  }

  if (data.type === 'join') {
    const name = String(data.name || '').slice(0, 20);

    // Mid-game: reconnect by name (works even if disconnect flag was never set due to silent disconnect)
    if (state.phase !== 'lobby') {
      const existingPlayer = state.players.find(p => p.name === name);
      if (existingPlayer) {
        existingPlayer.previousId = existingPlayer.id;
        existingPlayer.id = conn.peer;
        existingPlayer.disconnected = false;
        dropStaleConnsFor(existingPlayer, conn);
        migratePlayerId(existingPlayer.previousId, conn.peer);
        notify(`${name} reconnected! 🔄`);
        broadcastToAll({ type: 'player-list', players: state.players });
        renderLobbyPlayers();
        sendReconnectState(conn, existingPlayer);
      } else {
        try { conn.send({ type: 'error', fatal: true,
          message: 'That game is already in progress, so it can\'t take new players.' }); } catch(e) {}
      }
      return;
    }

    // Lobby: if same name already exists, update their connection (browser refresh / duplicate tab)
    const duplicate = state.players.find(p => p.name === name);
    if (duplicate) {
      duplicate.previousId = duplicate.id;
      duplicate.id = conn.peer;
      duplicate.disconnected = false;
      dropStaleConnsFor(duplicate, conn);
      broadcastToAll({ type: 'player-list', players: state.players });
      renderLobbyPlayers();
      return;
    }

    const player = { id: conn.peer, name, score: 0, prevScore: 0, disconnected: false };
    state.players.push(player);
    broadcastToAll({ type: 'player-list', players: state.players });
    renderLobbyPlayers();
    notify(`${name} joined!`);
    SFX.playerJoined();
  }

  if (data.type === 'answer') {
    // Ignore answers that arrive after the round moved on: the voting screen was
    // built from a snapshot of state.answers, so accepting one now would show
    // results nobody actually voted on.
    if (state.phase !== 'answering') return;
    state.answers[conn.peer] = data.answer;
    trackAnswerForTV(conn.peer);
    checkAllAnswered();
  }

  if (data.type === 'vote') {
    if (state.phase !== 'voting') return;
    state.votes[conn.peer] = data.vote;
    checkAllVoted();
  }
}

// A reconnected player has a new peer id, so any answer/vote they already
// submitted under the old one has to come with them or the round stalls waiting
// on input they have no way to send twice.
function migratePlayerId(oldId, newId) {
  if (!oldId || oldId === newId) return;
  if (state.answers[oldId] !== undefined && state.answers[oldId] !== '(disconnected)') {
    state.answers[newId] = state.answers[oldId];
  }
  delete state.answers[oldId];
  if (oldId in state.votes) {
    if (state.votes[oldId] !== null) state.votes[newId] = state.votes[oldId];
    delete state.votes[oldId];
  }
  Object.keys(state.votes).forEach(voter => {
    if (state.votes[voter] === oldId) state.votes[voter] = newId;
  });
}

function sendReconnectState(conn, player) {
  const promptsPerRound = 1;
  const elapsed = (Date.now() - state.phaseStartTime) / 1000;
  const base = {
    type: 'reconnect',
    phase: state.phase,
    settings: state.gameSettings,
    players: state.players,
    round: state.currentRound,
    totalRounds: state.totalRounds,
    promptsPerRound,
    promptIdx: (state.currentPromptIdx % promptsPerRound) + 1,
    recap: state.recap,
  };

  try {
    if (state.phase === 'answering') {
      conn.send({ ...base, prompt: state.prompts[state.currentPromptIdx],
        timeRemaining: Math.max(5, state.gameSettings.answerTime - elapsed) });
    } else if (state.phase === 'voting') {
      const answersArr = state.players
        .filter(p => state.answers[p.id] && state.answers[p.id] !== '(disconnected)')
        .map(p => ({ playerId: p.id, answer: state.answers[p.id] }));
      conn.send({ ...base, prompt: state.prompts[state.currentPromptIdx], answers: answersArr,
        timeRemaining: Math.max(5, votingSeconds(state.gameSettings.voteTime, answersArr.length) - elapsed) });
    } else {
      conn.send({ ...base });
    }
  } catch(e) {}
}

// ===== JOIN GAME =====
export async function joinGame() {
  const name = document.getElementById('join-name').value.trim();
  const code = normalizeRoomCode(document.getElementById('join-code').value);
  if (!name) { alert('Enter your name!'); return; }
  if (code.length < ROOM_CODE_LENGTH) {
    alert(`Enter the full ${ROOM_CODE_LENGTH}-character room code!`);
    return;
  }
  document.getElementById('join-code').value = code;

  state.myName = name;
  state.isHost = false;
  state.roomCode = code;
  state.reconnecting = false;

  bumpEpoch();
  destroyPeer(state.peer);
  state.peer = null;

  setJoinStatus('Starting up...', 'waiting');
  const epoch = state.netEpoch;
  if (!await peerJsReady()) {
    if (!stale(epoch)) setJoinStatus(PEERJS_LOAD_ERROR, 'error');
    return;
  }
  if (stale(epoch)) return;

  connectToHost(name, code, 0, epoch);
}

function setJoinStatus(text, kind) {
  const el = document.getElementById('join-status');
  if (!el) return;
  el.style.display = 'inline-block';
  el.textContent = text;
  el.className = 'status-badge status-' + kind;
}

// One attempt at the whole chain: open a peer, dial the host, open a channel.
// Every step gets its own timeout, because the failure that stranded everyone
// on "Connecting..." was ICE giving up silently — no error event ever arrives,
// so only a clock can notice.
function connectToHost(name, code, attempt, epoch) {
  if (stale(epoch)) return;

  const onJoinScreen = document.querySelector('.screen.active')?.id === 'screen-join';
  const label = attempt === 0 ? 'Connecting...' : `Connecting... (attempt ${attempt + 1} of ${JOIN_ATTEMPTS})`;
  if (onJoinScreen) setJoinStatus(label, 'waiting');

  const peer = new Peer(undefined, peerOptions());
  state.peer = peer;

  // Once the channel is open this attempt is over: later peer errors belong to
  // a live session and are the heartbeat's problem, not a reason to redial.
  let established = false;

  const giveUp = (message) => {
    if (stale(epoch) || established) return;
    destroyPeer(peer);
    if (attempt + 1 < JOIN_ATTEMPTS) {
      const delay = Math.min(1200 * Math.pow(2, attempt), 8000) + Math.random() * 600;
      setTimeout(() => connectToHost(name, code, attempt + 1, epoch), delay);
    } else {
      if (onJoinScreen) setJoinStatus(message, 'error');
      notify(message, 6000);
    }
  };

  const peerTimeout = setTimeout(() => {
    if (stale(epoch) || peer.open) return;
    giveUp('Could not reach the signalling server. Check your internet and try again.');
  }, PEER_OPEN_TIMEOUT_MS);

  peer.on('open', (id) => {
    if (stale(epoch)) return;
    clearTimeout(peerTimeout);
    state.myId = id;

    const conn = peer.connect(peerIdForRoom(code), CONNECT_OPTIONS);
    state.hostConn = conn;

    // ICE takes a few seconds on a good network and forever on a bad one.
    const nudge = setTimeout(() => {
      if (!stale(epoch) && !conn.open && onJoinScreen) {
        setJoinStatus('Still connecting — trying a relay...', 'waiting');
      }
    }, 6000);

    const connTimeout = setTimeout(() => {
      if (stale(epoch) || conn.open) return;
      clearTimeout(nudge);
      giveUp('Could not connect to the host. Ask them to confirm the code, then try again.');
    }, CONN_OPEN_TIMEOUT_MS);

    const onOpen = () => {
      if (stale(epoch)) return;
      established = true;
      clearTimeout(nudge);
      clearTimeout(connTimeout);
      state.lastHostContact = Date.now();
      state.reconnecting = false;
      conn.send({ type: 'join', name });
      setJoinStatus('✓ Connected!', 'connected');
      document.getElementById('player-wait-name').textContent = `You're in as "${name}"`;
      showScreen('screen-player-wait');
      startHeartbeat();
      // If a game is already running the host answers with a reconnect payload.
      requestSync();
    };

    if (conn.open) onOpen(); else conn.on('open', onOpen);

    conn.on('data', (data) => {
      if (stale(epoch)) return;
      state.lastHostContact = Date.now();
      handleHostMessage(data);
    });

    conn.on('error', () => {
      if (stale(epoch) || conn.open) return;
      clearTimeout(nudge);
      clearTimeout(connTimeout);
      giveUp('Could not connect to the host. Ask them to confirm the code, then try again.');
    });

    conn.on('close', () => {
      if (stale(epoch)) return;
      clearTimeout(nudge);
      clearTimeout(connTimeout);
      if (conn !== state.hostConn) return;   // superseded by a newer connection
      handleHostLinkLost();
    });
  });

  peer.on('error', (err) => {
    if (stale(epoch)) return;
    clearTimeout(peerTimeout);
    if (established) return;   // a live session; the heartbeat watches it now
    if (err.type === 'peer-unavailable') {
      // The broker has no such room. Retrying will not help.
      destroyPeer(peer);
      const msg = `No game found with code ${code}. Double-check it with the host.`;
      if (onJoinScreen) setJoinStatus(msg, 'error');
      notify(msg, 6000);
      return;
    }
    giveUp('Connection failed: ' + (err.message || err.type));
  });
}

// Single entry point for "the host went quiet", whether that came from a
// 'close' event or from the heartbeat noticing silence. The guard matters: the
// old code hooked reconnect to close, error *and* peer-error, so one dead link
// forked into several parallel reconnect chains, each spawning more peers —
// which is what turned a retry into a hard "could not connect".
function handleHostLinkLost() {
  if (state.isHost || state.reconnecting) return;
  if (state.phase !== 'lobby' && state.phase !== 'winner') {
    state.reconnecting = true;
    attemptClientReconnect(state.myName, state.roomCode, 0, state.netEpoch);
  } else if (document.querySelector('.screen.active')?.id === 'screen-player-wait') {
    state.reconnecting = true;
    notify('Lost the host — reconnecting...', 5000);
    attemptClientReconnect(state.myName, state.roomCode, 0, state.netEpoch);
  } else {
    notify('Disconnected from host');
    leaveGame();
  }
}

function attemptClientReconnect(name, code, attempt, epoch) {
  if (stale(epoch)) return;
  if (attempt === 0) notify('Connection lost — reconnecting...', 5000);
  if (attempt >= 5) {
    state.reconnecting = false;
    notify('Could not reconnect. Returning to home screen.');
    leaveGame();
    return;
  }

  const delay = Math.min(2000 * (attempt + 1), 10000) + Math.random() * 500;
  setTimeout(() => {
    if (stale(epoch)) return;
    stopHeartbeat();
    destroyPeer(state.peer);

    const peer = new Peer(undefined, peerOptions());
    state.peer = peer;
    let settled = false;

    // Exactly one outcome per attempt — success or a single retry.
    const fail = () => {
      if (settled || stale(epoch)) return;
      settled = true;
      destroyPeer(peer);
      attemptClientReconnect(name, code, attempt + 1, epoch);
    };

    const attemptTimeout = setTimeout(fail, PEER_OPEN_TIMEOUT_MS + CONN_OPEN_TIMEOUT_MS);

    peer.on('open', (id) => {
      if (settled || stale(epoch)) return;
      state.myId = id;
      const conn = peer.connect(peerIdForRoom(code), CONNECT_OPTIONS);
      state.hostConn = conn;

      const onOpen = () => {
        if (settled || stale(epoch)) return;
        settled = true;
        clearTimeout(attemptTimeout);
        state.lastHostContact = Date.now();
        state.reconnecting = false;
        conn.send({ type: 'join', name });
        notify('Reconnected! 🔄');
        startHeartbeat();
      };
      if (conn.open) onOpen(); else conn.on('open', onOpen);

      conn.on('data', (data) => {
        if (stale(epoch)) return;
        state.lastHostContact = Date.now();
        handleHostMessage(data);
      });
      conn.on('close', () => {
        clearTimeout(attemptTimeout);
        if (settled) { if (conn === state.hostConn) handleHostLinkLost(); }
        else fail();
      });
      conn.on('error', () => { clearTimeout(attemptTimeout); fail(); });
    });

    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable' || !peer.open) { clearTimeout(attemptTimeout); fail(); }
    });
  }, delay);
}

// Ask the host to restate the game's current phase. This is the safety net for
// a dropped state broadcast — the bug that left a connected player watching
// "Waiting for the host to start..." after the game had already begun.
function requestSync() {
  const now = Date.now();
  if (now - state.lastSyncRequest < SYNC_REQUEST_MIN_GAP) return;
  state.lastSyncRequest = now;
  sendToHost({ type: 'sync-request' });
}

// ===== HOST MESSAGE HANDLER (client receives) =====
export function handleHostMessage(data) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'ack') { handleAck(data.msgId); return; }
  if (data.type === 'error') {
    notify('⚠️ ' + data.message, 6000);
    // A rejected join used to leave the player parked on "YOU'RE IN!" forever.
    // Send them back to the join screen with the reason on it.
    if (data.fatal) {
      leaveGame();
      showScreen('screen-join');
      setJoinStatus(data.message, 'error');
    }
    return;
  }

  if (data.type === 'ping') {
    // The host is past the lobby but we are still sitting on the wait screen:
    // a state broadcast went missing. Ask for it again.
    const onWaitScreen = document.querySelector('.screen.active')?.id === 'screen-player-wait';
    if (onWaitScreen && data.phase && data.phase !== 'lobby') requestSync();
    return;
  }

  // Mirror the host's phase locally. Every state.phase assignment lives in
  // host-only code, so a client's phase sat on 'lobby' for the whole game —
  // which meant the mid-game branch of the disconnect handler could never run
  // and a dropped player was sent to the home screen instead of reconnecting.
  const CLIENT_PHASE = {
    prompt: 'answering', voting: 'voting', results: 'results',
    scoreboard: 'scoreboard', winner: 'winner',
  };
  if (CLIENT_PHASE[data.type]) state.phase = CLIENT_PHASE[data.type];

  switch(data.type) {
    case 'player-list':
      state.players = data.players;
      renderWaitPlayers();
      break;
    case 'game-start':
      state.gameSettings = data.settings;
      state.totalRounds = data.settings.rounds;
      state.players = data.players;
      state.recap = [];
      state.phase = 'answering';
      // The 'prompt' broadcast normally lands right behind this one. If it
      // does not, don't strand the player on the wait screen.
      setTimeout(() => {
        if (document.querySelector('.screen.active')?.id === 'screen-player-wait') requestSync();
      }, 4000);
      break;
    case 'prompt':
      startAnsweringPhase(data.prompt, data.round, data.promptIdx, data.totalPrompts);
      break;
    case 'voting':
      startVotingPhase(data.prompt, data.answers, data.round, data.promptIdx, data.totalPrompts);
      break;
    case 'results':
      if (data.recapEntry) state.recap.push(data.recapEntry);
      SFX.stopTick();
      SFX.drumroll(1.8);
      setTimeout(() => showResultsPhase(data.prompt, data.answers, data.votes, data.scores), 1900);
      break;
    case 'scoreboard':
      showScoreboardPhase(data.players, false);
      break;
    case 'winner':
      showWinnerPhase(data.players);
      break;
    case 'reconnect':
      handleReconnectState(data);
      break;
  }
}

function handleReconnectState(data) {
  state.gameSettings = data.settings;
  state.totalRounds = data.totalRounds;
  state.players = data.players;
  state.currentRound = data.round;
  state.phase = data.phase;
  if (data.recap) state.recap = data.recap;

  if (data.phase === 'answering' && data.prompt) {
    const saved = state.gameSettings.answerTime;
    state.gameSettings = { ...state.gameSettings, answerTime: Math.ceil(data.timeRemaining || 30) };
    startAnsweringPhase(data.prompt, data.round, data.promptIdx, data.promptsPerRound);
    state.gameSettings = { ...state.gameSettings, answerTime: saved };
  } else if (data.phase === 'voting' && data.prompt) {
    const saved = state.gameSettings.voteTime;
    state.gameSettings = { ...state.gameSettings, voteTime: Math.ceil(data.timeRemaining || 15) };
    startVotingPhase(data.prompt, data.answers, data.round, data.promptIdx, data.promptsPerRound);
    state.gameSettings = { ...state.gameSettings, voteTime: saved };
  } else if (data.phase === 'lobby') {
    renderWaitPlayers();
  } else {
    showScreen('screen-player-wait');
    renderWaitPlayers();
    notify('Reconnected! Waiting for next phase...');
  }
}
