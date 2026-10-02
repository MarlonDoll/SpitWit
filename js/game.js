// =====================================================
//  SPITWIT — Game Flow Logic
// =====================================================
import { state, clearTimer, shuffle, notify, votingSeconds } from './state.js';
import { PROMPT_PACKS, UNIQUE_PROMPTS, buildPersonalizedPool } from './prompts.js';
import { SFX } from './audio.js';
import { openHostDisplay, tvUpdate, trackAnswerForTV, closeTvWindow } from './tv.js';
import { startAnsweringPhase, startVotingPhase, showResultsPhase,
         showScoreboardPhase, showWinnerPhase, showScreen, selectVote } from './ui.js';
import { broadcastToAll, sendToHost, sendReliable, bumpEpoch, stopHeartbeat } from './network.js';

export function hostStartGame() {
  if (state.players.filter(p => !p.disconnected).length < 1) {
    alert('Need at least 1 player!'); return;
  }

  SFX.gameStart();

  const settings = state.gameSettings;
  const promptsPerRound = 1;
  const totalPromptsNeeded = settings.rounds * promptsPerRound;

  // Share of rounds that name real players when Personal Prompts is on. These
  // are the prompts people actually react to, so they lead rather than garnish.
  const PERSONAL_SHARE = 0.6;

  let pool;
  if (settings.promptPack === 'personalized') {
    state.prompts = buildPersonalizedPool(state.players, totalPromptsNeeded);
  } else {
    if (settings.promptPack === 'all') pool = [...UNIQUE_PROMPTS];
    else if (settings.promptPack === 'custom-only') pool = [...(settings.customPrompts || [])];
    else pool = [...(PROMPT_PACKS[settings.promptPack] || UNIQUE_PROMPTS)];

    if (settings.includeCustom && settings.customPrompts?.length) {
      pool = [...pool, ...settings.customPrompts];
    }

    shuffle(pool);

    if (settings.personalPrompts && state.players.length >= 2) {
      // Decide how many rounds are personal, then build exactly that many.
      // The old code merged ~95 personal prompts into a 435-prompt pool and
      // shuffled the lot, so a 5-round game drew 0.9 personal prompts on
      // average and 38% of games had none at all — the toggle was on and
      // essentially did nothing.
      const personalCount = Math.max(1, Math.round(totalPromptsNeeded * PERSONAL_SHARE));
      const personal = buildPersonalizedPool(state.players, personalCount);
      const regular = pool.slice(0, Math.max(0, totalPromptsNeeded - personal.length));
      state.prompts = shuffle([...personal, ...regular]).slice(0, totalPromptsNeeded);
    } else {
      state.prompts = pool.slice(0, totalPromptsNeeded);
    }
  }

  state.totalRounds = settings.rounds;
  state.currentRound = 0;
  state.currentPromptIdx = 0;
  state.recap = [];

  broadcastToAll({ type: 'game-start', settings, players: state.players });

  if (settings.hostDisplay) {
    document.getElementById('host-display-btn').classList.add('visible');
    openHostDisplay();
  }

  hostNextPrompt();
}

export function hostNextPrompt() {
  state.answers = {};
  state.votes = {};
  state.myAnswer = '';
  state.myVote = null;
  state.answerSubmitted = false;
  state.voteSubmitted = false;

  const promptsPerRound = 1;

  if (state.currentPromptIdx >= state.prompts.length) {
    hostShowFinalWinner();
    return;
  }

  const prompt = state.prompts[state.currentPromptIdx];
  state.currentRound = Math.floor(state.currentPromptIdx / promptsPerRound) + 1;
  const roundPromptIdx = (state.currentPromptIdx % promptsPerRound) + 1;

  state.phase = 'answering';
  state.phaseStartTime = Date.now();

  broadcastToAll({ type: 'prompt', prompt, round: state.currentRound, promptIdx: roundPromptIdx, totalPrompts: promptsPerRound });
  startAnsweringPhase(prompt, state.currentRound, roundPromptIdx, promptsPerRound);

  // Host timer (authoritative)
  clearTimer();
  let t = state.gameSettings.answerTime;

  // Schedule urgent ticking for last 5 seconds
  SFX.stopTick();
  if (t > 5) {
    setTimeout(() => { if (!state.answerSubmitted) SFX.startTick(); }, (t - 5) * 1000);
  }

  state.timerInterval = setInterval(() => {
    t--;
    if (t <= 0) {
      clearTimer();
      SFX.timesUp();
      // Short grace period so in-flight answers from clients can arrive before we fill (no answer)
      setTimeout(() => {
        if (state.phase !== 'answering') return; // already moved to voting via checkAllAnswered
        state.players.forEach(p => {
          if (!p.disconnected && state.answers[p.id] === undefined) {
            if (p.id === state.myId) {
              const partial = document.getElementById('answer-input')?.value.trim();
              state.answers[p.id] = partial || '(no answer)';
            } else {
              state.answers[p.id] = '(no answer)';
            }
          } else if (p.disconnected && state.answers[p.id] === undefined) {
            state.answers[p.id] = '(disconnected)';
          }
        });
        hostStartVoting();
      }, 800);
    }
  }, 1000);
}

export function checkAllAnswered() {
  // A late answer can arrive after the round has already moved on — an ACK retry,
  // or a client auto-submitting partial text as the deadline passes. Without this
  // guard that answer completed the set, called clearTimer() and killed the *vote*
  // timer, then no-oped in hostStartVoting's phase check: the round hung on the
  // voting screen until every last player happened to vote.
  if (state.phase !== 'answering') return;

  // Only count non-disconnected players who haven't answered yet
  const activePlayers = state.players.filter(p => !p.disconnected);
  const allAnswered = activePlayers.every(p => state.answers[p.id] !== undefined);
  if (allAnswered && activePlayers.length > 0) {
    clearTimer();
    SFX.stopTick();
    notify('All answers in! Moving on... ⚡');
    hostStartVoting();
  }
}

export function hostStartVoting() {
  if (state.phase === 'voting') return; // guard against double-call during grace period
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  const prompt = state.prompts[state.currentPromptIdx];
  // Only show non-disconnected answers (or players with real answers)
  const answersArr = state.players
    .filter(p => state.answers[p.id] && state.answers[p.id] !== '(disconnected)')
    .map(p => ({ playerId: p.id, answer: state.answers[p.id] }));

  // Shuffle so vote order isn't biased by join order
  for (let i = answersArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [answersArr[i], answersArr[j]] = [answersArr[j], answersArr[i]];
  }

  // If everyone disconnected somehow, fall through to tally
  if (answersArr.length < 2) {
    hostTallyVotes();
    return;
  }

  state.phase = 'voting';
  state.phaseStartTime = Date.now();

  const promptsPerRound = 1;
  broadcastToAll({ type: 'voting', prompt, answers: answersArr, round: state.currentRound,
    promptIdx: (state.currentPromptIdx % promptsPerRound) + 1, totalPrompts: promptsPerRound });
  startVotingPhase(prompt, answersArr, state.currentRound,
    (state.currentPromptIdx % promptsPerRound) + 1, promptsPerRound);

  clearTimer();
  let t = votingSeconds(state.gameSettings.voteTime, answersArr.length);

  SFX.stopTick();
  if (t > 5) {
    setTimeout(() => { if (!state.voteSubmitted) SFX.startTick(); }, (t - 5) * 1000);
  }

  state.timerInterval = setInterval(() => {
    t--;
    if (t <= 0) {
      clearTimer();
      SFX.timesUp();
      hostTallyVotes();
    }
  }, 1000);
}

export function checkAllVoted() {
  if (state.phase !== 'voting') return;   // same hazard: a late vote must not re-tally

  // All active (non-disconnected) players must have voted (null = abstain counts)
  const activePlayers = state.players.filter(p => !p.disconnected);
  const allVoted = activePlayers.every(p => p.id in state.votes);
  if (allVoted && activePlayers.length > 0) {
    clearTimer();
    SFX.stopTick();
    notify('All votes in! Tallying... ⚡');
    hostTallyVotes();
  }
}

export function hostTallyVotes() {
  if (state.phase === 'results') return;  // scores are awarded here; never run it twice

  // Include host vote
  if (state.myVote) state.votes[state.myId] = state.myVote;

  state.phase = 'results';
  const prompt = state.prompts[state.currentPromptIdx];
  const answersArr = state.players
    .filter(p => state.answers[p.id] && state.answers[p.id] !== '(disconnected)')
    .map(p => ({ playerId: p.id, answer: state.answers[p.id] }));

  // Count votes (null votes = abstain, don't count)
  const voteCounts = {};
  Object.values(state.votes).forEach(votedFor => {
    if (votedFor) voteCounts[votedFor] = (voteCounts[votedFor] || 0) + 1;
  });

  // Award points
  state.players.forEach(p => {
    p.prevScore = p.score;
    p.score += (voteCounts[p.id] || 0) * 500;
  });

  const scores = {};
  state.players.forEach(p => scores[p.id] = p.score);

  // Build recap entry
  const maxVotes = Math.max(...Object.values(voteCounts), 0);
  const recapEntry = {
    prompt,
    allAnswers: answersArr.map(a => {
      const player = state.players.find(p => p.id === a.playerId);
      return { name: player?.name || '?', answer: a.answer, votes: voteCounts[a.playerId] || 0 };
    }),
    winner: (() => {
      const winnerId = Object.entries(voteCounts).sort((a,b) => b[1]-a[1])[0]?.[0];
      const winnerAnswer = answersArr.find(a => a.playerId === winnerId);
      const winnerPlayer = state.players.find(p => p.id === winnerId);
      return maxVotes > 0 ? { name: winnerPlayer?.name || '?', answer: winnerAnswer?.answer || '' } : null;
    })()
  };
  state.recap.push(recapEntry);

  // Broadcast immediately so clients start their drumroll at the same time
  broadcastToAll({ type: 'results', prompt, answers: answersArr, votes: state.votes, scores, recapEntry });

  // Host shows results after drumroll delay
  SFX.stopTick();
  SFX.drumroll(1.8);
  setTimeout(() => {
    showResultsPhase(prompt, answersArr, state.votes, scores);
  }, 1900);
}

export function hostNextRound() {
  state.currentPromptIdx++;
  const promptsPerRound = 1;
  const newRound = Math.floor(state.currentPromptIdx / promptsPerRound) + 1;

  if (state.currentPromptIdx >= state.prompts.length || newRound > state.totalRounds) {
    hostShowFinalWinner();
    return;
  }

  const endOfPrevRound = state.currentPromptIdx % promptsPerRound === 0;
  if (endOfPrevRound) {
    state.phase = 'scoreboard';
    broadcastToAll({ type: 'scoreboard', players: state.players });
    showScoreboardPhase(state.players, true);
  } else {
    hostNextPrompt();
  }
}

export function hostContinue() {
  hostNextPrompt();
}

export function hostShowFinalWinner() {
  state.phase = 'winner';
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  broadcastToAll({ type: 'winner', players: sorted });
  showWinnerPhase(sorted);
}

export function submitAnswer() {
  const answer = document.getElementById('answer-input').value.trim();
  if (!answer) { notify('Type an answer first!'); return; }

  state.myAnswer = answer;
  state.answerSubmitted = true;
  SFX.stopTick();
  SFX.answerSubmit();

  document.getElementById('answer-input').disabled = true;
  document.getElementById('submit-answer-btn').style.display = 'none';
  document.getElementById('answer-submitted-msg').style.display = 'block';

  if (state.isHost) {
    state.answers[state.myId] = answer;
    trackAnswerForTV(state.myId);
    checkAllAnswered();
  } else {
    sendReliable({ type: 'answer', answer });
  }
}

export function submitVote() {
  if (!state.myVote) { notify('Select an answer to vote for!'); return; }
  state.voteSubmitted = true;
  SFX.stopTick();
  SFX.voteSubmit();

  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  const ttsBar = document.getElementById('tts-indicator');
  if (ttsBar) ttsBar.style.display = 'none';
  document.getElementById('vote-submit-btn').style.display = 'none';
  document.getElementById('vote-submitted-msg').style.display = 'block';

  if (state.isHost) {
    state.votes[state.myId] = state.myVote;
    checkAllVoted();
  } else {
    sendReliable({ type: 'vote', vote: state.myVote });
  }
}

export function leaveGame() {
  if (state.visualTimer) { clearInterval(state.visualTimer); state.visualTimer = null; }
  clearTimer();
  SFX.stopTick();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  closeTvWindow();
  document.getElementById('host-display-btn').classList.remove('visible');

  // Invalidate every in-flight network callback before tearing the peer down,
  // so a retry or reconnect timer from this session can't fire into the next one.
  bumpEpoch();
  stopHeartbeat();
  Object.values(state.pendingMessages).forEach(p => clearTimeout(p.timerId));
  state.connections.forEach(c => { try { c.close(); } catch(e) {} });
  if (state.peer) { try { state.peer.destroy(); } catch(e) {} state.peer = null; }

  const savedCustomPrompts = state.customPrompts || [];
  Object.assign(state, {
    isHost: false, peer: null, connections: [], players: [], myId: null,
    myName: '', hostConn: null, gameSettings: {}, currentRound: 0,
    totalRounds: 5, prompts: [], currentPromptIdx: 0, answers: {}, votes: {},
    timerInterval: null, visualTimer: null, phase: 'lobby', customPrompts: savedCustomPrompts,
    myVote: null, myAnswer: '', answerSubmitted: false, voteSubmitted: false,
    recap: [], phaseStartTime: 0, pendingMessages: {},
    roomCode: '', heartbeatInterval: null, lastHostContact: 0,
    lastSyncRequest: 0, reconnecting: false,
  });
  showScreen('screen-home');
}

export function playAgain() {
  leaveGame();
  showScreen('screen-host-setup');
}
