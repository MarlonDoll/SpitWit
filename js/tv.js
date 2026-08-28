// =====================================================
//  SPITWIT — TV Host Display (popup window)
// =====================================================
import { state } from './state.js';
import { notify } from './state.js';

let tvWindow = null;

export function openHostDisplay() {
  tvWindow = window.open('', 'SpitWitTV', 'width=1280,height=720,menubar=no,toolbar=no,location=no');
  if (!tvWindow) { notify('Allow popups to use TV mode!'); return; }

  tvWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>SPITWIT — TV Display</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Boogaloo&family=Nunito:wght@400;700;800&display=swap');
  :root{--bg:#0e0b1a;--surface:#17132a;--surface2:#1f1a35;--accent:#ff4757;--accent2:#ffd32a;--accent3:#a8ff3e;--accent4:#ff6b9d;--text:#f5f0ff;--muted:#7a6fa0;--border:#3d3570;--ink:#1a0a3e;}
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:100%;}
  body{background:var(--bg);color:var(--text);font-family:'Nunito',sans-serif;overflow:hidden;position:relative;}
  body::before{content:'';position:fixed;inset:0;background:radial-gradient(ellipse 70% 50% at 15% 15%,rgba(255,71,87,0.07) 0%,transparent 60%),radial-gradient(ellipse 60% 50% at 85% 75%,rgba(168,255,62,0.05) 0%,transparent 60%);pointer-events:none;z-index:0;}
  .doodle{position:fixed;pointer-events:none;z-index:0;inset:0;overflow:hidden;}
  .doodle span{position:absolute;opacity:0.05;animation:fdoodle linear infinite;font-size:36px;}
  @keyframes fdoodle{0%{transform:translateY(110vh) rotate(0deg);opacity:0}10%{opacity:0.05}90%{opacity:0.05}100%{transform:translateY(-10vh) rotate(360deg);opacity:0}}
  /* Fixed height, not min-height: the old box grew past the window and, with
     overflow hidden and centred content, silently clipped the answer cards off
     both ends. Everything below now scales with vh so a full table fits. */
  .wrap{position:relative;z-index:1;max-width:1400px;height:100%;margin:0 auto;padding:clamp(10px,2.2vh,40px) clamp(12px,2vw,40px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(8px,1.2vh,16px);}
  #tv{min-height:0;flex:1;justify-content:center;gap:clamp(8px,1.2vh,16px);}
  .logo{font-family:'Boogaloo',cursive;font-size:clamp(26px,6vh,64px);flex-shrink:0;margin-bottom:8px;color:var(--accent2);text-align:center;text-shadow:4px 4px 0 var(--ink),-2px -2px 0 var(--ink),2px -2px 0 var(--ink),-2px 2px 0 var(--ink),0 8px 0 rgba(255,71,87,0.5);transform:rotate(-1deg);display:inline-block;letter-spacing:2px;}
  .logo.small{font-size:clamp(20px,4vh,40px);}
  .phase{font-family:'Boogaloo',cursive;font-size:clamp(13px,2.4vh,24px);letter-spacing:3px;color:var(--muted);margin:0;text-align:center;text-transform:uppercase;flex-shrink:0;}
  .prompt-box{background:var(--surface);border:3px solid var(--accent);border-radius:20px;padding:clamp(12px,2.4vh,30px) clamp(18px,3vw,40px);text-align:center;margin:0;width:100%;max-width:1000px;font-size:clamp(18px,min(2.8vw,4.4vh),40px);font-weight:800;line-height:1.3;position:relative;box-shadow:6px 6px 0 rgba(255,71,87,0.35);flex-shrink:0;overflow-wrap:break-word;}
  .prompt-box::before{content:'💬';position:absolute;top:-18px;left:18px;font-size:38px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));}
  /* The grid is sized by the number of answers, not by a fixed card width: the
     column count and every font size arrive as custom properties from render().
     Rows are minmax(0,1fr) inside a definite height, so N cards always divide
     the space that is actually available instead of running off the bottom —
     a TV display is the one screen nobody can scroll. */
  .answers{display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:var(--card-gap,clamp(6px,1.2vh,20px));width:100%;max-width:1200px;flex:1 1 auto;min-height:0;overflow:hidden;align-content:stretch;}
  .answer-card{background:var(--surface);border:3px solid var(--border);border-radius:16px;padding:var(--card-pad,clamp(8px,1.6vh,28px)) clamp(8px,1.2vw,22px);font-size:var(--card-font,clamp(13px,min(1.9vw,2.7vh),26px));font-weight:700;line-height:1.25;text-align:center;min-height:0;min-width:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--card-gap-inner,clamp(2px,0.7vh,10px));transition:all 0.5s ease;box-shadow:4px 4px 0 var(--border);overflow-wrap:anywhere;}
  /* Truncate rather than spill: at a full table a rambling answer would
     otherwise push the vote count out of its own card. */
  .atext{display:-webkit-box;-webkit-line-clamp:var(--card-clamp,4);-webkit-box-orient:vertical;overflow:hidden;max-width:100%;}
  .answer-card.revealed{border-color:var(--accent3);background:rgba(168,255,62,0.06);box-shadow:4px 4px 0 var(--accent3);}
  .answer-card.winner{border-color:var(--accent2);background:rgba(255,211,42,0.1);box-shadow:6px 6px 0 var(--accent2);}
  .answer-card .pname{font-size:var(--pname,13px);letter-spacing:2px;text-transform:uppercase;color:var(--muted);display:none;font-weight:800;}
  .answer-card.revealed .pname,.answer-card.winner .pname{display:block;color:var(--accent3);}
  .answer-card.winner .pname{color:var(--accent2);}
  .vcount{font-family:'Boogaloo',cursive;font-size:var(--vcount,clamp(26px,5.5vh,58px));line-height:1;color:var(--accent2);display:none;text-shadow:3px 3px 0 rgba(0,0,0,0.4);}
  .answer-card.revealed .vcount,.answer-card.winner .vcount{display:block;}
  .timer{font-family:'Boogaloo',cursive;font-size:clamp(34px,8.5vh,100px);color:var(--accent2);line-height:1;margin:0;flex-shrink:0;text-shadow:5px 5px 0 var(--ink),0 8px 0 rgba(255,71,87,0.4);}
  .room-code{font-family:'Boogaloo',cursive;font-size:clamp(40px,11vh,90px);letter-spacing:clamp(6px,1.5vh,14px);color:var(--accent2);margin:0;text-shadow:5px 5px 0 var(--ink),0 8px 0 rgba(255,71,87,0.4);}
  .chips{display:flex;flex-wrap:wrap;justify-content:center;align-content:center;gap:var(--chip-gap,clamp(6px,1.2vh,14px));margin:0;flex:0 1 auto;min-height:0;overflow:hidden;}
  .chip{background:var(--surface2);border:2.5px solid var(--border);border-radius:100px;padding:var(--chip-pad,clamp(5px,1vh,10px)) clamp(10px,1.4vw,24px);font-size:var(--chip-font,clamp(13px,2vh,18px));white-space:nowrap;font-weight:700;box-shadow:3px 3px 0 var(--border);}
  .chip.done{border-color:var(--accent3);color:var(--accent3);box-shadow:3px 3px 0 var(--accent3);}
  /* One column runs out of room somewhere around ten players, so the list
     splits into columns and divides the available height into equal rows —
     32 players fit on a shared tab rather than running off the bottom. */
  .score-list{width:100%;max-width:min(100%,calc(700px * var(--score-cols,1)));list-style:none;display:grid;grid-auto-flow:column;grid-template-rows:repeat(var(--score-rows,1),minmax(0,1fr));grid-template-columns:repeat(var(--score-cols,1),minmax(0,1fr));gap:0 clamp(16px,3vw,44px);flex:1 1 auto;min-height:0;overflow:hidden;align-content:center;}
  .score-item{display:flex;align-items:center;gap:clamp(6px,1vw,14px);padding:var(--score-pad,clamp(1px,1.2vh,14px)) 0;border-bottom:2px dashed var(--border);font-size:var(--score-font,clamp(14px,2.4vh,22px));min-height:0;min-width:0;overflow:hidden;}
  .score-name{flex:1;font-weight:800;font-size:var(--score-font,clamp(14px,2.4vh,22px));text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .score-rank{font-family:'Boogaloo',cursive;font-size:var(--rank-font,clamp(22px,4vh,40px));width:clamp(28px,5vw,54px);flex-shrink:0;color:var(--muted);text-shadow:2px 2px 0 rgba(0,0,0,0.3);}
  .score-rank.gold{color:var(--accent2)}.score-rank.silver{color:#c8c8d4}.score-rank.bronze{color:#cd7f32}
  .score-pts{font-family:'Boogaloo',cursive;font-size:var(--rank-font,clamp(22px,4vh,40px));color:var(--accent3);margin-left:auto;text-shadow:2px 2px 0 rgba(0,0,0,0.4);}
  .winner-banner{font-family:'Boogaloo',cursive;font-size:clamp(34px,9vh,90px);flex-shrink:0;color:var(--accent2);text-align:center;text-shadow:5px 5px 0 var(--ink),-2px -2px 0 var(--ink),0 8px 0 rgba(255,71,87,0.5),0 16px 30px rgba(255,211,42,0.3);animation:wpop 0.6s cubic-bezier(0.34,1.56,0.64,1);}
  @keyframes wpop{from{transform:scale(0.5) rotate(-5deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
  .blind-badge{background:rgba(255,71,87,0.15);border:2px solid rgba(255,71,87,0.4);color:var(--accent);padding:clamp(3px,0.7vh,5px) 18px;border-radius:100px;font-size:clamp(11px,1.8vh,14px);letter-spacing:1px;text-transform:uppercase;font-weight:800;margin:0;display:inline-block;flex-shrink:0;}
  .disconnected-chip{opacity:0.4;border-style:dashed!important;}
</style>
</head>
<body>
<div class="doodle" id="doodles"></div>
<div class="wrap"><div id="tv" style="width:100%;text-align:center;display:flex;flex-direction:column;align-items:center;">
  <div class="logo">SPITWIT</div>
  <div class="phase">LOADING...</div>
</div></div>
<script>
  (function(){
    const emojis=['💬','😂','✦','🎯','🔥','⚡','💥','🎉','👏','😈','🤣','💡','🎤','✌️','🃏'];
    const bg=document.getElementById('doodles');
    for(let i=0;i<14;i++){
      const el=document.createElement('span');
      el.textContent=emojis[Math.floor(Math.random()*emojis.length)];
      el.style.left=(Math.random()*100)+'%';
      el.style.animationDuration=(20+Math.random()*20)+'s';
      el.style.animationDelay=-(Math.random()*30)+'s';
      el.style.fontSize=(24+Math.random()*20)+'px';
      bg.appendChild(el);
    }
  })();
  // The room advertises up to 32 players, so every phase has to lay itself out
  // for whatever turns up. These pick a grid shape and a type scale from the
  // item count, so 4 answers fill the screen and 32 still all fit on it.
  function gridVars(n) {
    const cols = n <= 2 ? n : n <= 3 ? 3 : n <= 8 ? 4 : n <= 15 ? 5 : n <= 24 ? 6 : 7;
    const rows = Math.max(1, Math.ceil(n / cols));
    const f    = Math.max(1.15, 7 / rows);          // card text
    const pad  = Math.max(0.3, 3.4 / rows);
    const gap  = Math.max(0.4, 2.4 / rows);
    const vc   = Math.max(2.0, 10 / rows);          // vote count on results
    const pn   = Math.max(0.9, 2.4 / rows);         // player name
    return [
      '--cols:' + cols,
      '--card-font:clamp(9px,min(1.8vw,' + f.toFixed(2) + 'vh),26px)',
      '--card-clamp:' + (rows <= 2 ? 4 : rows <= 3 ? 3 : 2),
      '--card-pad:clamp(3px,' + pad.toFixed(2) + 'vh,28px)',
      '--card-gap:clamp(4px,' + gap.toFixed(2) + 'vh,20px)',
      '--card-gap-inner:clamp(1px,' + (gap * 0.5).toFixed(2) + 'vh,10px)',
      '--vcount:clamp(14px,' + vc.toFixed(2) + 'vh,58px)',
      '--pname:clamp(8px,' + pn.toFixed(2) + 'vh,13px)',
    ].join(';');
  }

  // extra = the vertical space (in vh) the phase spends above the list; the
  // winner screen carries a trophy, a banner and a score line before it starts.
  function listVars(n, extra) {
    const cols = n <= 10 ? 1 : n <= 20 ? 2 : 3;
    const rows = Math.max(1, Math.ceil(n / cols));
    const avail = Math.max(20, 100 - (extra || 0));  // vh left for the list
    const row   = avail / rows;                      // vh per row
    return [
      '--score-cols:' + cols,
      '--score-rows:' + rows,
      '--score-font:clamp(9px,' + Math.max(0.9, row * 0.5).toFixed(2) + 'vh,22px)',
      '--score-pad:clamp(0px,' + Math.max(0, row * 0.12).toFixed(2) + 'vh,14px)',
      '--rank-font:clamp(12px,' + Math.max(1.2, row * 0.85).toFixed(2) + 'vh,40px)',
    ].join(';');
  }

  function chipVars(n) {
    return [
      '--chip-font:clamp(10px,' + Math.max(1.1, 14 / n).toFixed(2) + 'vh,18px)',
      '--chip-pad:clamp(2px,' + Math.max(0.2, 7 / n).toFixed(2) + 'vh,10px)',
      '--chip-gap:clamp(4px,' + Math.max(0.4, 9 / n).toFixed(2) + 'vh,14px)',
    ].join(';');
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.spitwitTV) render(e.data);
  });
  let timerInterval = null;
  function render(data) {
    const tv = document.getElementById('tv');
    const { phase } = data;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (phase === 'lobby') {
      tv.innerHTML = \`
        <div class="logo">SPITWIT</div>
        <div class="phase">Waiting for players</div>
        <div style="color:var(--muted);font-size:16px;font-weight:800;letter-spacing:3px;text-transform:uppercase;margin-bottom:6px;">Room Code</div>
        <div class="room-code">\${data.roomCode}</div>
        <div style="color:var(--muted);font-size:16px;font-weight:700;letter-spacing:1px;margin-bottom:20px;">\${data.players.length} player\${data.players.length!==1?'s':''} joined</div>
        <div class="chips" style="\${chipVars(Math.max(1,data.players.length))}">\${data.players.map(p=>\`<div class="chip">\${p.name}</div>\`).join('')}</div>
      \`;
    } else if (phase === 'answering') {
      let t = data.timerTotal || 60;
      tv.innerHTML = \`
        <div class="logo small">SPITWIT</div>
        <div class="phase">Round \${data.round} · Answer Time</div>
        <div class="prompt-box">\${data.prompt}</div>
        <div class="timer" id="tv-timer">\${t}</div>
        <div style="color:var(--muted);font-size:15px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Who's answered?</div>
        <div class="chips" id="tv-chips" style="\${chipVars(Math.max(1,data.players.length))}">\${data.players.map(p=>\`<div class="chip\${p.disconnected?' disconnected-chip':''}" id="tv-chip-\${p.id}">\${p.name}\${p.disconnected?' 📡':''}</div>\`).join('')}</div>
      \`;
      timerInterval = setInterval(() => {
        t--; const el = document.getElementById('tv-timer');
        if (el) { el.textContent = Math.max(0, t); if(t<=10) el.style.color='var(--accent)'; }
        if (t <= 0) clearInterval(timerInterval);
      }, 1000);
    } else if (phase === 'chip-update') {
      const chip = document.getElementById('tv-chip-' + data.playerId);
      if (chip) chip.classList.add('done');
    } else if (phase === 'voting') {
      let t = data.timerTotal || 30;
      tv.innerHTML = \`
        <div class="logo small">SPITWIT</div>
        <div class="phase">Vote Now!</div>
        \${data.isBlind ? '<div class="blind-badge">🕵️ Blind Voting</div>' : ''}
        <div class="prompt-box">\${data.prompt}</div>
        <div class="timer" id="tv-timer">\${t}</div>
        <div class="answers" style="\${gridVars(data.answers.length)}">\${data.answers.map(a => \`
          <div class="answer-card">
            <div class="atext">\${a.answer}</div>
            \${!data.isBlind ? \`<div class="pname">\${data.players.find(p=>p.id===a.playerId)?.name||''}</div>\` : ''}
          </div>
        \`).join('')}</div>
      \`;
      timerInterval = setInterval(() => {
        t--; const el = document.getElementById('tv-timer');
        if (el) { el.textContent = Math.max(0, t); if(t<=10) el.style.color='var(--accent)'; }
        if (t <= 0) clearInterval(timerInterval);
      }, 1000);
    } else if (phase === 'results') {
      tv.innerHTML = \`
        <div class="logo small">SPITWIT</div>
        <div class="phase">Results</div>
        <div class="prompt-box">\${data.prompt}</div>
        <div class="answers" style="\${gridVars(data.answers.length)}">\${data.answers.map(a => {
          const vc = data.votes[a.playerId] || 0;
          const isW = vc === data.maxVotes && vc > 0;
          const pname = data.players.find(p=>p.id===a.playerId)?.name || '';
          return \`<div class="answer-card \${isW?'winner':'revealed'}">
            <div class="atext">\${a.answer}</div>
            <div class="pname">\${pname}</div>
            <div class="vcount">\${vc}</div>
            <div style="font-size:var(--pname,13px);color:var(--muted);font-weight:800;">\${vc===1?'vote':'votes'}</div>
          </div>\`;
        }).join('')}</div>
      \`;
    } else if (phase === 'scoreboard') {
      const ranks = ['gold','silver','bronze'];
      tv.innerHTML = \`
        <div class="logo small">SPITWIT</div>
        <div class="phase">Leaderboard · After Round \${data.round}</div>
        <ul class="score-list" style="\${listVars(Math.max(1,data.players.length), 22)}">\${data.players.map((p,i)=>\`
          <li class="score-item">
            <div class="score-rank \${ranks[i]||''}">\${i+1}</div>
            <div class="score-name">\${p.name}\${p.disconnected?' 📡':''}</div>
            <div class="score-pts">\${p.score}</div>
          </li>
        \`).join('')}</ul>
      \`;
    } else if (phase === 'winner') {
      const w = data.players[0];
      const ranks = ['gold','silver','bronze'];
      tv.innerHTML = \`
        <div class="logo">SPITWIT</div>
        <div style="font-size:clamp(20px,5vh,52px);margin:0;flex-shrink:0;animation:wpop 0.5s cubic-bezier(0.34,1.56,0.64,1);">🎉🏆🎉</div>
        <div class="winner-banner">🏆 \${w.name} Wins!</div>
        <div style="color:var(--muted);font-size:clamp(12px,2.4vh,24px);font-weight:700;margin:0;flex-shrink:0;">\${w.score} points</div>
        <ul class="score-list" style="\${listVars(Math.max(1,data.players.length), 48)}">\${data.players.map((p,i)=>\`
          <li class="score-item">
            <div class="score-rank \${ranks[i]||''}">\${i+1}</div>
            <div class="score-name">\${p.name}</div>
            <div class="score-pts">\${p.score}</div>
          </li>
        \`).join('')}</ul>
      \`;
    }
  }
<\/script>
</body>
</html>`);
  tvWindow.document.close();
  notify('📺 TV Display opened!');
}

export function tvUpdate(phase, data) {
  if (!tvWindow || tvWindow.closed) return;
  tvWindow.postMessage({ spitwitTV: true, phase, ...data }, '*');
}

export function trackAnswerForTV(playerId) {
  tvUpdate('chip-update', { playerId });
}

export function closeTvWindow() {
  if (tvWindow && !tvWindow.closed) tvWindow.close();
  tvWindow = null;
}
