/* engine.js - 테트리스 코어 로직 (렌더링 없음) */
'use strict';

const COLS = 10, ROWS = 20, HIDDEN = 2, TOTAL = ROWS + HIDDEN;

const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
  O: [[1,1],[1,1]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
};

const COLORS = {
  I:'#25e2e2', J:'#4361ee', L:'#ff9f1c', O:'#ffd60a',
  S:'#3ddc55', T:'#b14aed', Z:'#ef476f', G:'#5c6470',
};

/* SRS 킥 테이블 (SRS 좌표계: y 위쪽 양수 → 적용 시 y 부호 반전) */
const KICKS_JLSTZ = {
  '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const KICKS_I = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rotateCW(m) {
  const n = m.length, out = [];
  for (let y = 0; y < n; y++) { out.push([]); for (let x = 0; x < n; x++) out[y].push(m[n-1-x][y]); }
  return out;
}
function rotateCCW(m) { return rotateCW(rotateCW(rotateCW(m))); }

const LINE_SCORE = [0, 100, 300, 500, 800];
const ATTACK = [0, 0, 1, 2, 4]; /* 지운 줄 수 → 가비지 공격 줄 수 */

/* ===== 난이도 조절 상수 ===== */
const LINES_PER_LEVEL = 8;  /* 몇 줄마다 레벨업할지. 낮출수록 레벨이 빨리 오름 (기존 10) */
const LEVEL_SPEED = 0.82;   /* 레벨당 낙하 간격 배율. 낮을수록 레벨업 시 급가속 (기존 0.85) */
const TIME_ACCEL = 0.97;    /* 플레이 시간 가속: 분당 배율. 낮을수록 빨리 가속 */
const TIME_CAP = 0.4;       /* 시간 가속 한도: 0.5=최대 2배, 0.4=2.5배, 0.33≈3배, 0.25=4배 */
const MIN_GRAVITY = 60;     /* 낙하 간격 하한(ms). 낮출수록 최종 속도가 빨라짐 */

class Tetris {
  /* callbacks: onLock(cleared), onTopOut(), onChange() */
  constructor(seed, callbacks = {}) {
    this.rng = mulberry32(seed ?? ((Math.random() * 2 ** 31) | 0));
    this.cb = callbacks;
    this.grid = Array.from({ length: TOTAL }, () => Array(COLS).fill(0));
    this.bag = [];
    this.queue = [];
    while (this.queue.length < 5) this.queue.push(this.nextFromBag());
    this.hold = null;
    this.canHold = true;
    this.score = 0; this.lines = 0; this.level = 1;
    this.alive = true;
    this.pendingGarbage = 0;
    this.elapsed = 0;
    this.dropTimer = 0;
    this.lockTimer = -1;      /* -1: 접지 아님 */
    this.lockResets = 0;
    this.spawn();
  }

  nextFromBag() {
    if (this.bag.length === 0) {
      this.bag = ['I','J','L','O','S','T','Z'];
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  spawn(type) {
    const t = type ?? this.queue.shift();
    if (!type) this.queue.push(this.nextFromBag());
    this.cur = {
      type: t,
      mat: SHAPES[t].map(r => r.slice()),
      x: t === 'O' ? 4 : 3,
      y: HIDDEN, /* 보이는 영역 최상단에서 스폰 → 새 블럭/홀드 교체가 즉시 보임 */
      r: 0,
    };
    this.lockTimer = -1; this.lockResets = 0;
    if (this.collides(this.cur.mat, this.cur.x, this.cur.y)) {
      /* 스폰 위치 겹침 → 게임 오버 */
      this.alive = false;
      this.mergePiece();
      this.cb.onTopOut && this.cb.onTopOut();
    }
    this.cb.onChange && this.cb.onChange();
  }

  collides(mat, px, py) {
    for (let y = 0; y < mat.length; y++) for (let x = 0; x < mat.length; x++) {
      if (!mat[y][x]) continue;
      const gx = px + x, gy = py + y;
      if (gx < 0 || gx >= COLS || gy >= TOTAL) return true;
      if (gy >= 0 && this.grid[gy][gx]) return true;
    }
    return false;
  }

  grounded() { return this.collides(this.cur.mat, this.cur.x, this.cur.y + 1); }

  resetLock() {
    if (this.lockTimer >= 0 && this.lockResets < 15) { this.lockTimer = 0; this.lockResets++; }
  }

  move(dx) {
    if (!this.alive) return false;
    if (!this.collides(this.cur.mat, this.cur.x + dx, this.cur.y)) {
      this.cur.x += dx; this.resetLock(); this.cb.onChange && this.cb.onChange();
      return true;
    }
    return false;
  }

  rotate(dir) { /* dir: 1 CW, -1 CCW */
    if (!this.alive || this.cur.type === 'O') return;
    const from = this.cur.r, to = (from + (dir === 1 ? 1 : 3)) % 4;
    const mat = dir === 1 ? rotateCW(this.cur.mat) : rotateCCW(this.cur.mat);
    const table = this.cur.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    for (const [dx, dy] of table[`${from}>${to}`]) {
      const nx = this.cur.x + dx, ny = this.cur.y - dy; /* SRS y 반전 */
      if (!this.collides(mat, nx, ny)) {
        this.cur.mat = mat; this.cur.x = nx; this.cur.y = ny; this.cur.r = to;
        this.resetLock(); this.cb.onChange && this.cb.onChange();
        return;
      }
    }
  }

  softDrop() {
    if (!this.alive) return;
    if (!this.grounded()) { this.cur.y++; this.score += 1; this.cb.onChange && this.cb.onChange(); }
  }

  hardDrop() {
    if (!this.alive) return;
    let d = 0;
    while (!this.grounded()) { this.cur.y++; d++; }
    this.score += d * 2;
    this.lock();
  }

  holdPiece() {
    if (!this.alive || !this.canHold) return;
    this.canHold = false;
    const held = this.hold;
    this.hold = this.cur.type;
    this.spawn(held ?? undefined);
  }

  ghostY() {
    let y = this.cur.y;
    while (!this.collides(this.cur.mat, this.cur.x, y + 1)) y++;
    return y;
  }

  mergePiece() {
    const { mat, x, y, type } = this.cur;
    for (let py = 0; py < mat.length; py++) for (let px = 0; px < mat.length; px++) {
      if (mat[py][px] && y + py >= 0) this.grid[y + py][x + px] = type;
    }
  }

  lock() {
    this.mergePiece();
    const full = [];
    for (let y = 0; y < TOTAL; y++) if (this.grid[y].every(c => c)) full.push(y);
    for (const y of full) {
      this.grid.splice(y, 1);
      this.grid.unshift(Array(COLS).fill(0));
    }
    const cleared = full.length;
    if (cleared) {
      this.lines += cleared;
      this.score += LINE_SCORE[cleared] * this.level;
      this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
    }
    /* 대전: 공격받은 가비지 삽입 (줄을 지웠으면 그만큼 상쇄) */
    if (this.pendingGarbage > 0) {
      const offset = Math.min(this.pendingGarbage, ATTACK[cleared]);
      this.pendingGarbage -= offset;
      if (this.pendingGarbage > 0) this.insertGarbage(this.pendingGarbage);
      this.pendingGarbage = 0;
    }
    this.canHold = true;
    this.cb.onLock && this.cb.onLock(cleared, full.map(y => y - HIDDEN));
    if (this.alive) this.spawn();
  }

  insertGarbage(n) {
    n = Math.min(n, 8);
    for (let i = 0; i < n; i++) {
      const row = Array(COLS).fill('G');
      row[Math.floor(this.rng() * COLS)] = 0;
      this.grid.shift();
      this.grid.push(row);
    }
    /* 위로 밀려서 천장에 닿았는지 검사 */
    if (this.grid[HIDDEN - 1].some(c => c)) {
      this.alive = false;
      this.cb.onTopOut && this.cb.onTopOut();
    }
  }

  receiveGarbage(n) { this.pendingGarbage += n; }

  gravityMs() {
    const base = 1000 * Math.pow(LEVEL_SPEED, this.level - 1);
    /* 플레이 시간에 따른 추가 가속 (TIME_CAP까지) */
    const timeFactor = Math.max(TIME_CAP, Math.pow(TIME_ACCEL, this.elapsed / 60000));
    return Math.max(MIN_GRAVITY, base * timeFactor);
  }

  tick(dt) {
    if (!this.alive) return;
    this.elapsed += dt;
    if (this.grounded()) {
      if (this.lockTimer < 0) this.lockTimer = 0;
      this.lockTimer += dt;
      if (this.lockTimer >= 500) this.lock();
    } else {
      this.lockTimer = -1;
      this.dropTimer += dt;
      const g = this.gravityMs();
      while (this.dropTimer >= g && !this.grounded()) {
        this.cur.y++; this.dropTimer -= g;
        this.cb.onChange && this.cb.onChange();
      }
    }
  }

  /* 대전 동기화용 직렬화 (보이는 20줄 + 현재 조각 합성) */
  snapshot() {
    const g = this.grid.slice(HIDDEN).map(r => r.slice());
    if (this.alive) {
      const { mat, x, y, type } = this.cur;
      for (let py = 0; py < mat.length; py++) for (let px = 0; px < mat.length; px++) {
        const gy = y + py - HIDDEN, gx = x + px;
        if (mat[py][px] && gy >= 0 && gy < ROWS) g[gy][gx] = type;
      }
    }
    return g.map(r => r.map(c => c || '.').join('')).join('|');
  }
}
