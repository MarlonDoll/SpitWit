// =====================================================
//  SPITWIT — Game Flow Logic
// =====================================================
import { state, clearTimer, shuffle, notify } from './state.js';
import { PROMPT_PACKS, UNIQUE_PROMPTS, buildPersonalizedPool, interleavePersonal } from './prompts.js';
import { SFX } from './audio.js';
import { openHostDisplay, tvUpdate, trackAnswerForTV, closeTvWindow } from './tv.js';
import { startAnsweringPhase, startVotingPhase, showResultsPhase,
         showScoreboardPhase, showWinnerPhase, showScreen, selectVote } from './ui.js';
import { broadcastToAll, sendToHost, sendReliable } from './network.js';

export function hostStartGame() {
  if (state.players.filter(p => !p.disconnected).length < 1) {
    alert('Need at least 1 player!'); return;
  }

  SFX.gameStart();

  const settings = state.gameSettings;
  const promptsPerRound = Math.min(3, Math.ceil(state.players.length / 2));
  const totalPromptsNeeded = settings.rounds * promptsPerRound;

  let pool;
  if (settings.promptPack === 'personalized') {
    pool = buildPersonalizedPool(state.players, totalPromptsNeeded);
    shuffle(pool);
    state.prompts = pool.slice(0, totalPromptsNeeded);
  } else {
    if (settings.promptPack === 'all') pool = [...UNIQUE_PROMPTS];
    else if (settings.promptPack === 'custom-only') pool = [...(settings.customPrompts || [])];
    else pool = [...(PROMPT_PACKS[settings.promptPack] || UNIQUE_PROMPTS)];

    if (settings.includeCustom && settings.customPrompts?.length) {
      pool = [...pool, ...settings.customPrompts];
    }

    if (settings.personalPrompts && state.players.length >= 2) {
      const personalNeeded = settings.rounds * state.players.length;
      const personalPool = buildPersonalizedPool(state.players, personalNeeded);
      pool = interleavePersonal(pool, personalPool, promptsPerRound, state.players.length);
    }

    shuffle(pool);
    state.prompts = pool.slice(0, totalPromptsNeeded);
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

  const promptsPerRound = Math.min(3, Math.ceil(state.players.length / 2));

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
      // Fill any unanswered players
      state.players.forEach(p => {
        if (!p.disconnected && state.answers[p.id] === undefined) {
          state.answers[p.id] = '(no answer)';
        } else if (p.disconnected && state.answers[p.id] === undefined) {
          state.answers[p.id] = '(disconnected)';
        }
      });
      hostStartVoting();
    }
  }, 1000);
}

export function checkAllAnswered() {
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
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  const prompt = state.prompts[state.currentPromptIdx];
  // Only show non-disconnected answers (or players with real answers)
  const answersArr = state.players
    .filter(p => state.answers[p.id] && state.answers[p.id] !== '(disconnected)')
    .map(p => ({ playerId: p.id, answer: state.answers[p.id] }));

  // If everyone disconnected somehow, fall through to tally
  if (answersArr.length < 2) {
    hostTallyVotes();
    return;
  }

  state.phase = 'voting';
  state.phaseStartTime = Date.now();

  const promptsPerRound = Math.min(3, Math.ceil(state.players.length / 2));
  broadcastToAll({ type: 'voting', prompt, answers: answersArr, round: state.currentRound,
    promptIdx: (state.currentPromptIdx % promptsPerRound) + 1, totalPrompts: promptsPerRound });
  startVotingPhase(prompt, answersArr, state.currentRound,
    (state.currentPromptIdx % promptsPerRound) + 1, promptsPerRound);

  clearTimer();
  let t = state.gameSettings.voteTime;

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
  const promptsPerRound = Math.min(3, Math.ceil(state.players.length / 2));
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
  clearTimer();
  SFX.stopTick();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  closeTvWindow();
  document.getElementById('host-display-btn').classList.remove('visible');
  if (state.peer) { try { state.peer.destroy(); } catch(e) {} state.peer = null; }

  const savedCustomPrompts = state.customPrompts || [];
  Object.assign(state, {
    isHost: false, peer: null, connections: [], players: [], myId: null,
    myName: '', hostConn: null, gameSettings: {}, currentRound: 0,
    totalRounds: 5, prompts: [], currentPromptIdx: 0, answers: {}, votes: {},
    timerInterval: null, phase: 'lobby', customPrompts: savedCustomPrompts,
    myVote: null, myAnswer: '', answerSubmitted: false, voteSubmitted: false,
    recap: [], phaseStartTime: 0, pendingMessages: {},
  });
  showScreen('screen-home');
}

export function playAgain() {
  leaveGame();
  showScreen('screen-host-setup');
}
