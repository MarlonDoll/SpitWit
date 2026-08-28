// =====================================================
//  SPITWIT — Shared State + Core Utilities
// =====================================================

export const state = {
  isHost: false,
  peer: null,
  connections: [],
  players: [],        // [{id, name, score, prevScore, disconnected}]
  myId: null,
  myName: '',
  hostConn: null,     // client's connection to host
  gameSettings: {},
  currentRound: 0,
  totalRounds: 5,
  prompts: [],
  currentPromptIdx: 0,
  answers: {},        // {playerId: answer}
  votes: {},          // {voterId: answererPlayerId}
  timerInterval: null,
  visualTimer: null,    // visual countdown interval (separate from game-logic timer)
  phase: 'lobby',     // lobby | answering | voting | results | scoreboard | winner
  customPrompts: [],
  myVote: null,
  myAnswer: '',
  answerSubmitted: false,
  voteSubmitted: false,
  recap: [],          // [{prompt, winner, allAnswers}]
  phaseStartTime: 0,  // timestamp when current timed phase began (for reconnect sync)
  // Message ACK tracking
  pendingMessages: {},  // {msgId: {msg, retryCount, timerId}}
  // ===== CONNECTION HEALTH =====
  netEpoch: 0,          // bumped on every leave/rejoin; stale callbacks compare against it and bail
  roomCode: '',         // code of the room we are hosting or joined
  heartbeatInterval: null,
  lastHostContact: 0,   // client: timestamp of the last packet seen from the host
  lastSyncRequest: 0,   // client: rate-limits sync-request so a stall can't spam the host
  reconnecting: false,  // client: guards against parallel reconnect chains
};

export function clearTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function notify(msg, duration = 2500) {
  const el = document.createElement('div');
  el.className = 'notification';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

export function generateMsgId() {
  return Math.random().toString(36).substring(2, 10);
}
