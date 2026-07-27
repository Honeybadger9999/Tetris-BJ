/* app.js - 화면 전환, 렌더링, 입력, 게임 모드 */
'use strict';

/* ---------- 공통: 화면 전환 ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}

/* ---------- 닉네임 ---------- */
function getNickname() { return localStorage.getItem('tetris_nick') || ''; }
function setNickname(n) { localStorage.setItem('tetris_nick', n); refreshNickUI(); }
function refreshNickUI() {
  const n = getNickname();
  $('#nickDisplay').textContent = n ? n : '닉네임을 정해주세요';
}
async function ensureNickname() {
  let n = getNickname();
  if (n) return n;
  n = (prompt('랭킹과 대전에서 사용할 닉네임 (최대 12자)') || '').trim().slice(0, 12);
  if (!n) return null;
  setNickname(n);
  return n;
}

/* ---------- 렌더링 ---------- */
const CELL = 30;

function drawCell(ctx, x, y, size, color, ghost = false) {
  const px = x * size, py = y * size;
  if (ghost) {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(px, py, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(px, py, size, size * 0.18);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(px, py + size * 0.85, size, size * 0.15);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
}

function drawBoard(canvas, game) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0f1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  /* 격자 */
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  for (let x = 1; x < COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, ROWS * CELL); ctx.stroke(); }
  for (let y = 1; y < ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(COLS * CELL, y * CELL); ctx.stroke(); }
  /* 쌓인 블럭 */
  for (let y = HIDDEN; y < TOTAL; y++) for (let x = 0; x < COLS; x++) {
    const c = game.grid[y][x];
    if (c) drawCell(ctx, x, y - HIDDEN, CELL, COLORS[c]);
  }
  if (!game.alive) return;
  /* 고스트 (연하게) */
  const gy = game.ghostY();
  const { mat, x: px, y: py, type } = game.cur;
  ctx.globalAlpha = 0.22;
  for (let y = 0; y < mat.length; y++) for (let x = 0; x < mat.length; x++) {
    if (mat[y][x] && gy + y >= HIDDEN)
      drawCell(ctx, px + x, gy + y - HIDDEN, CELL, COLORS[type], true);
  }
  ctx.globalAlpha = 1;
  /* 현재 조각 */
  for (let y = 0; y < mat.length; y++) for (let x = 0; x < mat.length; x++) {
    if (mat[y][x] && py + y >= HIDDEN)
      drawCell(ctx, px + x, py + y - HIDDEN, CELL, COLORS[type]);
  }
}

function drawPieceAt(ctx, type, cx, cy, size) {
  const m = SHAPES[type];
  let minX = 4, maxX = -1, minY = 4, maxY = -1;
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) {
    if (m[y][x]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  const w = (maxX - minX + 1) * size, h = (maxY - minY + 1) * size;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (m[y][x]) {
      const px = cx - w / 2 + (x - minX) * size, py = cy - h / 2 + (y - minY) * size;
      ctx.save(); ctx.translate(px, py);
      drawCell(ctx, 0, 0, size, COLORS[type]);
      ctx.restore();
    }
  }
}

function drawHold(canvas, game) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0f1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (game.hold) {
    ctx.globalAlpha = game.canHold ? 1 : 0.35;
    drawPieceAt(ctx, game.hold, canvas.width / 2, canvas.height / 2, 20);
    ctx.globalAlpha = 1;
  }
}

function drawNext(canvas, game) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0f1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  game.queue.slice(0, 5).forEach((t, i) => {
    drawPieceAt(ctx, t, canvas.width / 2, 34 + i * 62, 18);
  });
}

/* ---------- 줄 삭제 이펙트 ---------- */
const Effects = { rows: [], text: null };

function addClearEffect(cleared, rows) {
  const t0 = performance.now();
  (rows || []).forEach(y => { if (y >= 0) Effects.rows.push({ y, t0 }); });
  if (cleared >= 2) {
    const label = { 2: 'DOUBLE', 3: 'TRIPLE', 4: 'TETRIS!' }[cleared];
    Effects.text = { label, t0 };
  }
}

function drawEffects(canvas) {
  const ctx = canvas.getContext('2d');
  const now = performance.now();
  for (let i = Effects.rows.length - 1; i >= 0; i--) {
    const e = Effects.rows[i];
    const p = (now - e.t0) / 280;
    if (p >= 1) { Effects.rows.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - p)})`;
    ctx.fillRect(0, e.y * CELL, COLS * CELL, CELL);
  }
  if (Effects.text) {
    const p = (now - Effects.text.t0) / 800;
    if (p >= 1) { Effects.text = null; return; }
    ctx.save();
    ctx.globalAlpha = p < 0.7 ? 1 : (1 - p) / 0.3;
    ctx.font = "22px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = Effects.text.label === 'TETRIS!' ? '#ffd60a' : '#25e2e2';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 16;
    ctx.fillText(Effects.text.label, canvas.width / 2, canvas.height / 2 - 40 - p * 26);
    ctx.restore();
  }
}

function drawSnapshot(canvas, snap) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b0f1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!snap) return;
  const size = canvas.width / COLS;
  const rows = snap.split('|');
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < COLS; x++) {
    const c = rows[y][x];
    if (c && c !== '.') { ctx.fillStyle = COLORS[c] || '#888'; ctx.fillRect(x * size, y * size, size - 0.5, size - 0.5); }
  }
}

/* ---------- 입력 (키보드 DAS + 터치) ---------- */
const Input = {
  game: null,
  paused: false,
  keys: {},
  dasTimer: 0, arrTimer: 0, dasDir: 0,
  softTimer: 0,

  init() {
    document.addEventListener('keydown', (e) => {
      if (!this.game || !this.game.alive || this.paused) {
        if (e.code === 'KeyP') togglePause();
        return;
      }
      if (e.repeat) { e.preventDefault(); return; }
      switch (e.code) {
        case 'ArrowLeft': this.dasDir = -1; this.dasTimer = 0; this.game.move(-1); break;
        case 'ArrowRight': this.dasDir = 1; this.dasTimer = 0; this.game.move(1); break;
        case 'ArrowDown': this.keys.soft = true; this.game.softDrop(); this.softTimer = 0; break;
        case 'ArrowUp': case 'KeyX': this.game.rotate(1); break;
        case 'KeyZ': this.game.rotate(-1); break;
        case 'Space': e.preventDefault(); this.game.hardDrop(); break;
        case 'KeyC': case 'ShiftLeft': case 'ShiftRight': this.game.holdPiece(); break;
        case 'KeyP': togglePause(); break;
      }
      if (['ArrowLeft','ArrowRight','ArrowDown','Space','ArrowUp'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft' && this.dasDir === -1) this.dasDir = 0;
      if (e.code === 'ArrowRight' && this.dasDir === 1) this.dasDir = 0;
      if (e.code === 'ArrowDown') this.keys.soft = false;
    });
    /* 터치 버튼 */
    const bind = (id, down, repeat) => {
      const el = $(id);
      if (!el) return;
      let iv = null;
      const start = (e) => {
        e.preventDefault(); down();
        if (repeat) iv = setInterval(down, 90);
      };
      const stop = () => { if (iv) { clearInterval(iv); iv = null; } };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', stop);
      el.addEventListener('pointerleave', stop);
      el.addEventListener('pointercancel', stop);
    };
    bind('#tLeft', () => this.game && this.game.alive && !this.paused && this.game.move(-1), true);
    bind('#tRight', () => this.game && this.game.alive && !this.paused && this.game.move(1), true);
    bind('#tDown', () => this.game && this.game.alive && !this.paused && this.game.softDrop(), true);
    bind('#tRot', () => this.game && this.game.alive && !this.paused && this.game.rotate(1));
    bind('#tDrop', () => this.game && this.game.alive && !this.paused && this.game.hardDrop());
    bind('#tHold', () => this.game && this.game.alive && !this.paused && this.game.holdPiece());
  },

  tick(dt) {
    if (!this.game || !this.game.alive || this.paused) return;
    if (this.dasDir !== 0) {
      this.dasTimer += dt;
      if (this.dasTimer >= 160) {
        this.arrTimer += dt;
        if (this.arrTimer >= 45) { this.game.move(this.dasDir); this.arrTimer = 0; }
      }
    } else { this.dasTimer = 0; this.arrTimer = 0; }
    if (this.keys.soft) {
      this.softTimer += dt;
      if (this.softTimer >= 50) { this.game.softDrop(); this.softTimer = 0; }
    }
  },
};

/* ---------- 게임 세션 ---------- */
const Session = {
  game: null, mode: 'single', raf: 0, lastTs: 0,
  versus: { players: [], oppEls: {}, aliveIds: new Set(), lastSync: 0, finished: false },

  startSingle() {
    this.mode = 'single';
    this.game = new Tetris(null, {
      onLock: (cleared, rows) => addClearEffect(cleared, rows),
      onTopOut: () => this.singleGameOver(),
    });
    Input.game = this.game; Input.paused = false;
    $('#overlay').classList.remove('show');
    $('#versusArea').style.display = 'none';
    showScreen('screen-game');
    this.runLoop();
  },

  startVersus(seed, players) {
    this.mode = 'versus';
    const v = this.versus;
    v.players = players; v.finished = false;
    v.aliveIds = new Set(players.map(p => p.id));
    v.lastSync = 0;
    /* 상대 미니보드 생성 */
    const area = $('#versusArea');
    area.innerHTML = ''; area.style.display = 'flex';
    v.oppEls = {};
    for (const p of players) {
      if (p.id === Net.playerId) continue;
      const wrap = document.createElement('div');
      wrap.className = 'opp';
      wrap.innerHTML = `<canvas width="100" height="200"></canvas>
        <div class="opp-name">${escapeHtml(p.nickname)}</div>
        <div class="opp-score">0</div>`;
      area.appendChild(wrap);
      v.oppEls[p.id] = wrap;
    }
    this.game = new Tetris(seed, {
      onLock: (cleared, rows) => { addClearEffect(cleared, rows); this.onVersusLock(cleared); },
      onTopOut: () => this.onMyTopout(),
    });
    Input.game = this.game; Input.paused = false;
    $('#overlay').classList.remove('show');
    showScreen('screen-game');
    /* 3초 카운트다운 */
    Input.paused = true;
    let n = 3;
    const ov = $('#overlay'), msg = $('#overlayMsg');
    $('#overlayButtons').innerHTML = '';
    ov.classList.add('show');
    msg.textContent = n;
    const iv = setInterval(() => {
      n--;
      if (n > 0) msg.textContent = n;
      else {
        clearInterval(iv); ov.classList.remove('show');
        Input.paused = false;
        this.lastTs = 0;
      }
    }, 1000);
    this.runLoop();
  },

  onVersusLock(cleared) {
    const atk = ATTACK[cleared];
    if (atk > 0) {
      const targets = [...this.versus.aliveIds].filter(id => id !== Net.playerId);
      if (targets.length) {
        const t = targets[Math.floor(Math.random() * targets.length)];
        Net.send('attack', { from: Net.playerId, target: t, n: atk });
      }
    }
    this.syncState(true);
  },

  syncState(force = false) {
    if (this.mode !== 'versus') return;
    const now = performance.now();
    if (!force && now - this.versus.lastSync < 350) return;
    this.versus.lastSync = now;
    Net.send('state', {
      id: Net.playerId,
      snap: this.game.snapshot(),
      score: this.game.score,
      alive: this.game.alive,
    });
  },

  onMyTopout() {
    if (this.mode === 'single') return;
    this.versus.aliveIds.delete(Net.playerId);
    Net.send('topout', { id: Net.playerId });
    this.syncState(true);
    const place = this.versus.aliveIds.size + 1;
    this.showVersusResult(`${place}위로 탈락...`, false);
    this.checkVersusEnd();
  },

  onOppState(p) {
    const el = this.versus.oppEls[p.id];
    if (!el) return;
    drawSnapshot(el.querySelector('canvas'), p.snap);
    el.querySelector('.opp-score').textContent = p.score.toLocaleString();
    if (!p.alive) el.classList.add('dead');
  },

  onOppTopout(id) {
    this.versus.aliveIds.delete(id);
    const el = this.versus.oppEls[id];
    if (el) el.classList.add('dead');
    this.checkVersusEnd();
  },

  onOppLeft(id) {
    if (this.mode !== 'versus' || this.versus.finished) return;
    if (this.versus.aliveIds.has(id) && id !== Net.playerId) this.onOppTopout(id);
  },

  checkVersusEnd() {
    const v = this.versus;
    if (v.finished) return;
    if (v.aliveIds.size === 1 && v.aliveIds.has(Net.playerId)) {
      v.finished = true;
      this.showVersusResult('🏆 승리!', true);
    } else if (v.aliveIds.size <= 1) {
      v.finished = true;
    }
  },

  showVersusResult(text, stop) {
    const ov = $('#overlay');
    $('#overlayMsg').textContent = text;
    $('#overlayButtons').innerHTML = '';
    const btn = document.createElement('button');
    btn.textContent = '대기실로 돌아가기';
    btn.onclick = () => { ov.classList.remove('show'); Lobby.backToLobby(); };
    $('#overlayButtons').appendChild(btn);
    ov.classList.add('show');
    if (stop && this.game) this.game.alive = false;
  },

  async singleGameOver() {
    const g = this.game;
    const ov = $('#overlay');
    $('#overlayMsg').innerHTML =
      `게임 오버<br><span class="big">${g.score.toLocaleString()}</span>점<br>` +
      `<span class="sub">${g.lines}줄 · 레벨 ${g.level}</span>`;
    const btns = $('#overlayButtons');
    btns.innerHTML = '';
    /* 랭킹 등록 폼 */
    if (Leaderboard.available() && g.score > 0) {
      const wrap = document.createElement('div');
      wrap.className = 'rank-submit';
      wrap.innerHTML =
        `<input id="rankNick" maxlength="12" placeholder="닉네임 (최대 12자)" value="${escapeHtml(getNickname())}">
         <button id="rankSubmitBtn">🏆 랭킹 등록</button>`;
      btns.appendChild(wrap);
      wrap.querySelector('#rankSubmitBtn').onclick = async () => {
        const nick = wrap.querySelector('#rankNick').value.trim().slice(0, 12);
        if (!nick) { wrap.querySelector('#rankNick').focus(); return; }
        setNickname(nick);
        const btn = wrap.querySelector('#rankSubmitBtn');
        btn.disabled = true; btn.textContent = '등록 중...';
        try {
          await Leaderboard.submit(nick, g.score, g.lines, g.level);
          wrap.innerHTML = '<div class="done">✓ 랭킹에 등록되었습니다</div>';
          const view = document.createElement('button');
          view.textContent = '랭킹 보기';
          view.onclick = () => { ov.classList.remove('show'); this.stopLoop(); RankUI.open('week'); };
          wrap.appendChild(view);
        } catch (_) {
          btn.disabled = false; btn.textContent = '🏆 랭킹 등록 (다시 시도)';
        }
      };
    } else if (!Leaderboard.available()) {
      const note = document.createElement('div');
      note.className = 'sub';
      note.textContent = '랭킹 등록은 Supabase 설정 후 사용할 수 있습니다';
      btns.appendChild(note);
    }
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.textContent = label; b.onclick = fn; btns.appendChild(b); return b;
    };
    mk('다시 하기', () => this.startSingle());
    mk('메뉴로', () => { this.stopLoop(); showScreen('screen-menu'); });
    ov.classList.add('show');
  },

  runLoop() {
    this.stopLoop();
    this.lastTs = 0;
    const loop = (ts) => {
      this.raf = requestAnimationFrame(loop);
      if (!this.lastTs) { this.lastTs = ts; return; }
      const dt = Math.min(ts - this.lastTs, 100);
      this.lastTs = ts;
      if (!Input.paused && this.game) {
        this.game.tick(dt);
        Input.tick(dt);
        if (this.mode === 'versus') this.syncState();
      }
      if (this.game) {
        drawBoard($('#board'), this.game);
        drawEffects($('#board'));
        drawHold($('#holdCanvas'), this.game);
        drawNext($('#nextCanvas'), this.game);
        $('#statScore').textContent = this.game.score.toLocaleString();
        $('#statLines').textContent = this.game.lines;
        $('#statLevel').textContent = this.game.level;
      }
    };
    this.raf = requestAnimationFrame(loop);
  },

  stopLoop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; },
};

function togglePause() {
  if (Session.mode !== 'single' || !Session.game || !Session.game.alive) return;
  Input.paused = !Input.paused;
  const ov = $('#overlay');
  if (Input.paused) {
    $('#overlayMsg').textContent = '일시정지';
    $('#overlayButtons').innerHTML = '';
    const b = document.createElement('button');
    b.textContent = '계속하기 (P)';
    b.onclick = togglePause;
    $('#overlayButtons').appendChild(b);
    ov.classList.add('show');
    Session.lastTs = 0;
  } else ov.classList.remove('show');
}

/* ---------- 대전 대기실 ---------- */
const Lobby = {
  maxPlayers: 2,

  open(maxPlayers) {
    if (!Net.available()) {
      alert('대전 모드를 사용하려면 config.js에 Supabase 설정이 필요합니다.');
      return;
    }
    this.maxPlayers = maxPlayers;
    $('#lobbyTitle').textContent = maxPlayers === 2 ? '1:1 대결' : '멀티 대결 (최대 4인)';
    $('#lobbySetup').style.display = 'block';
    $('#lobbyRoom').style.display = 'none';
    $('#joinCode').value = '';
    showScreen('screen-lobby');
  },

  async createRoom() {
    const nick = await ensureNickname();
    if (!nick) return;
    try {
      setLobbyBusy(true);
      await Net.create(nick, this.maxPlayers);
      this.enterRoom();
    } catch (e) { alert(e.message); }
    finally { setLobbyBusy(false); }
  },

  async joinRoom() {
    const code = $('#joinCode').value.trim().toUpperCase();
    if (code.length !== 4) { alert('4자리 방 코드를 입력하세요.'); return; }
    const nick = await ensureNickname();
    if (!nick) return;
    try {
      setLobbyBusy(true);
      await Net.join(code, nick);
      this.maxPlayers = Net.maxPlayers;
      this.enterRoom();
    } catch (e) { alert(e.message); }
    finally { setLobbyBusy(false); }
  },

  enterRoom() {
    $('#lobbySetup').style.display = 'none';
    $('#lobbyRoom').style.display = 'block';
    $('#roomCode').textContent = Net.code;
    Net.handlers.onMembers = () => this.renderMembers();
    Net.handlers.onStart = (p) => Session.startVersus(p.seed, p.players);
    Net.handlers.onState = (p) => Session.onOppState(p);
    Net.handlers.onAttack = (p) => {
      if (p.target === Net.playerId && Session.game && Session.game.alive)
        Session.game.receiveGarbage(p.n);
    };
    Net.handlers.onTopout = (p) => Session.onOppTopout(p.id);
    this.renderMembers();
  },

  renderMembers() {
    const list = $('#memberList');
    const ids = Object.keys(Net.members);
    list.innerHTML = ids.map(id => {
      const m = Net.members[id];
      const me = id === Net.playerId ? ' (나)' : '';
      return `<li>${escapeHtml(m.nickname || '...')}${me}</li>`;
    }).join('');
    $('#memberCount').textContent = `${ids.length} / ${Net.maxPlayers}`;
    /* 진행 중인 게임에서 나간 사람 처리 */
    if (Session.mode === 'versus') {
      for (const p of Session.versus.players) {
        if (!ids.includes(p.id)) Session.onOppLeft(p.id);
      }
    }
    const startBtn = $('#startBtn');
    if (Net.isHost()) {
      startBtn.style.display = 'inline-block';
      startBtn.disabled = ids.length < 2;
      startBtn.textContent = ids.length < 2 ? '참가자를 기다리는 중...' : '게임 시작';
      $('#hostHint').textContent = '';
    } else {
      startBtn.style.display = 'none';
      $('#hostHint').textContent = '방장이 시작하기를 기다리는 중...';
    }
  },

  start() {
    const ids = Object.keys(Net.members);
    if (ids.length > Net.maxPlayers) { alert('정원을 초과했습니다.'); return; }
    const payload = Net.startGame();
    Session.startVersus(payload.seed, payload.players);
  },

  backToLobby() {
    Session.stopLoop();
    $('#versusArea').style.display = 'none';
    Session.mode = 'single';
    if (Net.channel) { this.enterRoom(); showScreen('screen-lobby'); }
    else showScreen('screen-menu');
  },

  exit() {
    Net.leave();
    showScreen('screen-menu');
  },
};

function setLobbyBusy(b) {
  $$('#lobbySetup button').forEach(el => el.disabled = b);
}

/* ---------- 랭킹 화면 ---------- */
const RankUI = {
  period: 'week',
  async open(period) {
    if (!Leaderboard.available()) {
      alert('랭킹을 사용하려면 config.js에 Supabase 설정이 필요합니다.');
      return;
    }
    this.period = period || this.period;
    showScreen('screen-rank');
    $$('#rankTabs button').forEach(b =>
      b.classList.toggle('on', b.dataset.period === this.period));
    const body = $('#rankBody');
    body.innerHTML = '<tr><td colspan="4" class="sub">불러오는 중...</td></tr>';
    const rows = await Leaderboard.top(this.period);
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4" class="sub">아직 기록이 없습니다. 첫 기록의 주인공이 되어보세요!</td></tr>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    body.innerHTML = rows.map((r, i) =>
      `<tr><td>${medals[i] || (i + 1)}</td><td>${escapeHtml(r.nickname)}</td>` +
      `<td class="num">${r.score.toLocaleString()}</td><td class="num">${r.lines}</td></tr>`
    ).join('');
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 초기화 ---------- */
window.addEventListener('DOMContentLoaded', () => {
  Input.init();
  refreshNickUI();

  $('#btnSingle').onclick = () => Session.startSingle();
  $('#btn1v1').onclick = () => Lobby.open(2);
  $('#btnMulti').onclick = () => Lobby.open(4);
  $('#btnRank').onclick = () => RankUI.open('week');
  $('#btnNick').onclick = () => {
    const n = (prompt('닉네임 (최대 12자)', getNickname()) || '').trim().slice(0, 12);
    if (n) setNickname(n);
  };
  $('#btnCreateRoom').onclick = () => Lobby.createRoom();
  $('#btnJoinRoom').onclick = () => Lobby.joinRoom();
  $('#startBtn').onclick = () => Lobby.start();
  $('#btnLobbyExit').onclick = () => Lobby.exit();
  $('#btnGameExit').onclick = () => {
    if (Session.mode === 'versus') {
      if (Session.game && Session.game.alive && !Session.versus.finished) {
        if (!confirm('게임을 포기하고 나갈까요?')) return;
        Session.game.alive = false;
        Session.onMyTopout();
        return;
      }
      Lobby.backToLobby();
    } else {
      Session.stopLoop();
      showScreen('screen-menu');
    }
  };
  $$('#rankTabs button').forEach(b => b.onclick = () => RankUI.open(b.dataset.period));
  $('#btnRankBack').onclick = () => showScreen('screen-menu');

  if (!Net.available()) {
    $('#btn1v1').classList.add('dim');
    $('#btnMulti').classList.add('dim');
    $('#btnRank').classList.add('dim');
    $('#setupNote').style.display = 'block';
  }
});
