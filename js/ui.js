// =====================================================
//  SPITWIT — UI Rendering & Screen Management
// =====================================================
import { state, notify } from './state.js';
import { SFX, readAnswersAloud } from './audio.js';
import { tvUpdate } from './tv.js';

const SCREEN_PHASE = {
  'screen-home': 'phase-home', 'screen-host-setup': 'phase-home',
  'screen-join': 'phase-home', 'screen-host-lobby': 'phase-lobby',
  'screen-player-wait': 'phase-lobby', 'screen-answer': 'phase-answering',
  'screen-vote': 'phase-voting', 'screen-results': 'phase-results',
  'screen-scoreboard': 'phase-scoreboard', 'screen-winner': 'phase-winner',
  'screen-recap': 'phase-winner',
};
const ALL_PHASE_CLASSES = [...new Set(Object.values(SCREEN_PHASE))];

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.body.classList.remove(...ALL_PHASE_CLASSES);
  const ph = SCREEN_PHASE[id];
  if (ph) document.body.classList.add(ph);
}

export function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-settings').style.display = 'none';
  document.getElementById('tab-custom-prompts').style.display = 'none';
  if (tab === 'settings') {
    document.getElementById('tab-settings').style.display = 'block';
    document.querySelectorAll('.tab')[0].classList.add('active');
  } else {
    document.getElementById('tab-custom-prompts').style.display = 'block';
    document.querySelectorAll('.tab')[1].classList.add('active');
  }
}

export function renderCustomPrompts() {
  const list = document.getElementById('custom-prompts-list');
  const count = document.getElementById('custom-prompts-count');
  count.textContent = `${state.customPrompts.length} custom prompt${state.customPrompts.length !== 1 ? 's' : ''} added`;
  list.innerHTML = state.customPrompts.map((p, i) => `
    <li class="custom-prompt-item">
      <span>${p}</span>
      <button onclick="window.removeCustomPrompt(${i})">×</button>
    </li>
  `).join('');
}

export function renderLobbyPlayers() {
  const list = document.getElementById('lobby-player-list');
  const count = document.getElementById('player-count');
  list.innerHTML = state.players.map(p =>
    `<div class="player-chip${p.disconnected ? ' disconnected' : ''}">
      <div class="dot" style="${p.disconnected ? 'background:var(--accent);box-shadow:0 0 6px var(--accent);' : ''}"></div>
      ${p.name}${p.id === state.myId ? ' (you)' : ''}${p.disconnected ? ' 📡' : ''}
    </div>`
  ).join('');
  count.textContent = state.players.filter(p => !p.disconnected).length;
  const code = document.getElementById('room-code-display').textContent;
  tvUpdate('lobby', { players: state.players, roomCode: code });
}

export function renderWaitPlayers() {
  const list = document.getElementById('wait-player-list');
  list.innerHTML = state.players.map(p =>
    `<div class="player-chip${p.disconnected ? ' disconnected' : ''}">
      <div class="dot"></div>
      ${p.name}${p.id === state.myId ? ' (you)' : ''}
    </div>`
  ).join('');
}

export function copyRoomCode() {
  const code = document.getElementById('room-code-display').textContent;
  navigator.clipboard.writeText(code).then(() => notify('Room code copied! 📋'));
}

// ===== ANSWERING PHASE =====
export function startAnsweringPhase(prompt, round, promptIdx, totalPrompts) {
  state.answerSubmitted = false;
  state.myAnswer = '';

  document.getElementById('answer-round-badge').textContent = `ROUND ${round} · PROMPT ${promptIdx} OF ${totalPrompts}`;
  document.getElementById('answer-prompt-text').textContent = prompt;
  document.getElementById('answer-for-label').textContent = 'YOUR PROMPT';

  const textarea = document.getElementById('answer-input');
  textarea.value = '';
  textarea.disabled = false;

  document.getElementById('submit-answer-btn').style.display = 'block';
  document.getElementById('answer-submitted-msg').style.display = 'none';
  resetCharCounter();
  showScreen('screen-answer');
  tvUpdate('answering', { prompt, round, promptIdx, totalPrompts, players: state.players, timerTotal: state.gameSettings?.answerTime || 60 });

  SFX.promptReveal();

  const total = state.gameSettings?.answerTime || 60;
  let t = total;
  document.getElementById('answer-timer').textContent = t;
  document.getElementById('answer-timer-bar').style.width = '100%';

  // Visual countdown (both host and client) — clear any stale timer from a previous phase
  if (state.visualTimer) { clearInterval(state.visualTimer); state.visualTimer = null; }
  document.getElementById('answer-timer').classList.remove('urgent');
  document.getElementById('answer-timer-bar').classList.remove('urgent');
  const ti = setInterval(() => {
    t--;
    const timerEl = document.getElementById('answer-timer');
    const barEl = document.getElementById('answer-timer-bar');
    timerEl.textContent = Math.max(0, t);
    barEl.style.width = (Math.max(0, t) / total * 100) + '%';
    if (t <= 10) { timerEl.classList.add('urgent'); barEl.classList.add('urgent'); }
    if (t <= 0) { clearInterval(ti); state.visualTimer = null; }
  }, 1000);
  state.visualTimer = ti;

  // Urgent tick for last 5 seconds
  SFX.stopTick();
  if (total > 5 && !state.isHost) {
    // Clients tick on their own; host tick is handled in game.js timer
    setTimeout(() => { if (!state.answerSubmitted) SFX.startTick(); }, (total - 5) * 1000);
  }
}

function resetCharCounter() {
  const counter = document.getElementById('char-counter');
  if (counter) { counter.textContent = '150 left'; counter.style.color = 'var(--muted)'; }
}

export function updateCharCounter() {
  const len = document.getElementById('answer-input')?.value.length || 0;
  const counter = document.getElementById('char-counter');
  if (!counter) return;
  const remaining = 150 - len;
  counter.textContent = `${remaining} left`;
  counter.style.color = remaining < 20 ? 'var(--accent)' : 'var(--muted)';
}

// ===== VOTING PHASE =====
export function startVotingPhase(prompt, answers, round, promptIdx, totalPrompts) {
  state.voteSubmitted = false;
  state.myVote = null;

  const isBlind = state.gameSettings?.blindVoting;
  const doReadAloud = state.gameSettings?.readAloud;

  document.getElementById('vote-round-badge').textContent = `ROUND ${round} · VOTE!`;
  document.getElementById('vote-prompt-text').textContent = prompt;
  document.getElementById('vote-submit-btn').style.display = 'block';
  document.getElementById('vote-submitted-msg').style.display = 'none';
  document.getElementById('blind-vote-badge').style.display = isBlind ? 'block' : 'none';

  const list = document.getElementById('vote-answers-list');
  list.innerHTML = answers.map((a, idx) => {
    const isOwn = a.playerId === state.myId;
    const player = state.players.find(p => p.id === a.playerId);
    const nameHtml = isBlind
      ? (isOwn ? '<span style="color:var(--muted);font-size:12px;">YOUR ANSWER</span>' : '')
      : `<span style="color:var(--muted);font-size:12px;">${isOwn ? 'YOUR ANSWER' : (player?.name || '')}</span>`;
    return `
      <div class="answer-item ${isOwn ? 'own-answer' : ''}"
           id="vote-opt-${a.playerId}"
           style="animation-delay:${idx * 0.07}s"
           onclick="${isOwn ? `window.notify("You can't vote for yourself!")` : `window.selectVote('${a.playerId}')`}">
        <span>${a.answer}</span>
        ${nameHtml}
      </div>
    `;
  }).join('');

  showScreen('screen-vote');
  tvUpdate('voting', { prompt, answers, players: state.players, isBlind, round, timerTotal: state.gameSettings?.voteTime || 30 });

  SFX.stopTick();
  SFX.promptReveal();

  const total = state.gameSettings?.voteTime || 30;
  let t = total;
  document.getElementById('vote-timer').textContent = t;
  document.getElementById('vote-timer-bar').style.width = '100%';
  document.getElementById('vote-timer').classList.remove('urgent');
  document.getElementById('vote-timer-bar').classList.remove('urgent');
  // Clear any stale visual timer from the answer phase
  if (state.visualTimer) { clearInterval(state.visualTimer); state.visualTimer = null; }
  const ti = setInterval(() => {
    t--;
    const timerEl = document.getElementById('vote-timer');
    const barEl = document.getElementById('vote-timer-bar');
    timerEl.textContent = Math.max(0, t);
    barEl.style.width = (Math.max(0, t) / total * 100) + '%';
    if (t <= 10) { timerEl.classList.add('urgent'); barEl.classList.add('urgent'); }
    if (t <= 0) { clearInterval(ti); state.visualTimer = null; }
  }, 1000);
  state.visualTimer = ti;
  // Note: do NOT set state.timerInterval here — host's clearTimer() in hostStartVoting
  // needs to clear the previous answer game-logic timer, not this visual timer.

  if (total > 5) {
    setTimeout(() => { if (!state.voteSubmitted) SFX.startTick(); }, (total - 5) * 1000);
  }

  if (doReadAloud && 'speechSynthesis' in window) {
    readAnswersAloud(prompt, answers);
  }
}

export function selectVote(playerId) {
  if (state.voteSubmitted) return;
  state.myVote = playerId;
  document.querySelectorAll('.answer-item').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('vote-opt-' + playerId);
  if (el) el.classList.add('selected');
  SFX.voteSelect();
}

// ===== RESULTS PHASE =====
export function showResultsPhase(prompt, answers, votes, scores) {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  const ttsBar = document.getElementById('tts-indicator');
  if (ttsBar) ttsBar.style.display = 'none';
  document.getElementById('results-prompt-text').textContent = prompt;

  const voteCounts = {};
  Object.values(votes).forEach(v => { voteCounts[v] = (voteCounts[v] || 0) + 1; });
  const maxVotes = Math.max(...Object.values(voteCounts), 0);

  const container = document.getElementById('results-answers');
  container.innerHTML = answers.map((a, idx) => {
    const vCount = voteCounts[a.playerId] || 0;
    const player = state.players.find(p => p.id === a.playerId);
    const isWinner = vCount === maxVotes && vCount > 0;
    return `
      <div class="vote-option ${isWinner ? 'winning' : (vCount === 0 && maxVotes > 0 ? 'losing' : '')}"
           style="animation-delay:${idx * 0.12}s">
        <div>${a.answer}</div>
        <div class="voter-name">${player?.name || 'Unknown'}</div>
        <div class="vote-count">${vCount}</div>
        <div style="font-size:12px;color:var(--muted);">${vCount === 1 ? 'vote' : 'votes'}</div>
      </div>
    `;
  }).join('');

  document.getElementById('results-next-area').style.display = state.isHost ? 'block' : 'none';
  document.getElementById('results-wait-area').style.display = state.isHost ? 'none' : 'block';

  showScreen('screen-results');
  tvUpdate('results', { prompt, answers, votes: voteCounts, players: state.players, maxVotes });

  // Sound
  SFX.stopTick();
  if (maxVotes > 0) SFX.roundWin();
  else SFX.sadTrombone();
}

// ===== SCOREBOARD =====
export function showScoreboardPhase(players, isHost) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const ranks = ['gold', 'silver', 'bronze'];

  const list = document.getElementById('score-list');
  list.innerHTML = sorted.map((p, i) => {
    const delta = p.score - (p.prevScore || 0);
    return `
      <li class="score-item" style="animation-delay:${i * 0.07}s">
        <div class="score-rank ${ranks[i] || ''}">${i + 1}</div>
        <div class="score-name">${p.name}${p.id === state.myId ? ' 👤' : ''}${p.disconnected ? ' 📡' : ''}</div>
        <div class="score-delta">${delta > 0 ? '+' + delta : ''}</div>
        <div class="score-pts">${p.score}</div>
      </li>
    `;
  }).join('');

  document.getElementById('scoreboard-badge').textContent = `AFTER ROUND ${state.currentRound}`;
  document.getElementById('scoreboard-next-area').style.display = isHost ? 'block' : 'none';
  document.getElementById('scoreboard-wait-area').style.display = isHost ? 'none' : 'block';
  showScreen('screen-scoreboard');
  tvUpdate('scoreboard', { players: sorted, round: state.currentRound });
  SFX.scoreboard();
}

// ===== WINNER SCREEN =====
export function showWinnerPhase(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];
  const ranks = ['gold', 'silver', 'bronze'];

  document.getElementById('winner-name').textContent = `🏆 ${winner.name} WINS!`;
  document.getElementById('winner-score').textContent = `${winner.score} points`;

  const list = document.getElementById('final-score-list');
  list.innerHTML = sorted.map((p, i) => `
    <li class="score-item" style="animation-delay:${i * 0.07 + 0.3}s">
      <div class="score-rank ${ranks[i] || ''}">${i + 1}</div>
      <div class="score-name">${p.name}${p.id === state.myId ? ' 👤' : ''}</div>
      <div class="score-pts">${p.score}</div>
    </li>
  `).join('');

  showScreen('screen-winner');
  tvUpdate('winner', { players: sorted });
  SFX.winnerFanfare();
  launchConfetti();
}

function launchConfetti() {
  const colors = ['#ff4757','#ffd32a','#a8ff3e','#ff6b9d','#70a1ff','#eccc68','#ffffff'];
  for (let i = 0; i < 110; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-piece';
    const size = 6 + Math.random() * 10;
    el.style.cssText = `left:${Math.random()*100}vw;width:${size}px;height:${size*(0.4+Math.random()*0.8)}px;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>0.5?'50%':'2px'};animation-duration:${2.2+Math.random()*2.5}s;animation-delay:${Math.random()*1.8}s;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5500);
  }
}

// ===== POST-GAME RECAP =====
export function showRecap() {
  const container = document.getElementById('recap-list');
  if (!state.recap || state.recap.length === 0) {
    container.innerHTML = '<p class="text-muted" style="text-align:center;padding:20px;">No recap data — play a full game first!</p>';
    showScreen('screen-recap');
    return;
  }

  container.innerHTML = state.recap.map((entry, i) => {
    const sortedAnswers = [...entry.allAnswers].sort((a, b) => b.votes - a.votes);
    const answersHtml = sortedAnswers.map(a => {
      const isWinner = entry.winner && a.answer === entry.winner.answer && a.name === entry.winner.name;
      const isMe = a.name === state.myName;
      return `
        <div class="recap-answer ${isWinner ? 'recap-answer-winner' : ''}">
          <div style="display:flex;align-items:center;gap:8px;flex:1;">
            ${isMe ? '<span style="font-size:11px;background:rgba(168,255,62,0.15);border:1px solid var(--accent3);color:var(--accent3);padding:2px 8px;border-radius:100px;white-space:nowrap;font-weight:800;">YOU</span>' : ''}
            <span class="recap-answer-text">${a.answer}</span>
          </div>
          <span class="recap-answer-meta">${a.name} · ${a.votes} ${a.votes === 1 ? 'vote' : 'votes'}${isWinner ? ' 🏆' : ''}</span>
        </div>`;
    }).join('');

    return `
      <div class="card recap-card">
        <div class="recap-prompt-num">PROMPT ${i + 1}</div>
        <div class="recap-prompt-text">${entry.prompt}</div>
        ${answersHtml}
      </div>`;
  }).join('');

  showScreen('screen-recap');
}
