/* net.js - Supabase Realtime 기반 대전 방 관리 */
'use strict';

const Net = {
  channel: null,
  code: null,
  playerId: Math.random().toString(36).slice(2, 10),
  maxPlayers: 2,
  members: {},          /* id -> {nickname, maxPlayers} */
  handlers: {},         /* onMembers, onStart, onState, onAttack, onTopout, onLeaveGame */

  available() { return !!SB; },

  makeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
  },

  async create(nickname, maxPlayers) {
    this.maxPlayers = maxPlayers;
    return this.join(this.makeCode(), nickname, maxPlayers, true);
  },

  async join(code, nickname, maxPlayers, isCreate = false) {
    this.leave();
    this.code = code.toUpperCase();
    const ch = SB.channel('room:' + this.code, {
      config: { broadcast: { self: false }, presence: { key: this.playerId } },
    });
    this.channel = ch;

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      this.members = {};
      for (const id of Object.keys(state)) {
        const meta = state[id][0];
        this.members[id] = meta;
        if (meta.maxPlayers) this.maxPlayers = meta.maxPlayers;
      }
      this.handlers.onMembers && this.handlers.onMembers(this.members);
    });
    ch.on('broadcast', { event: 'start' }, ({ payload }) =>
      this.handlers.onStart && this.handlers.onStart(payload));
    ch.on('broadcast', { event: 'state' }, ({ payload }) =>
      this.handlers.onState && this.handlers.onState(payload));
    ch.on('broadcast', { event: 'attack' }, ({ payload }) =>
      this.handlers.onAttack && this.handlers.onAttack(payload));
    ch.on('broadcast', { event: 'topout' }, ({ payload }) =>
      this.handlers.onTopout && this.handlers.onTopout(payload));

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('연결 시간 초과')), 8000);
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          await ch.track({
            nickname,
            maxPlayers: isCreate ? maxPlayers : undefined,
            joinedAt: Date.now(),
          });
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timeout);
          reject(new Error('방 연결 실패'));
        }
      });
    });

    /* 참가자: 방 존재/정원 확인 (presence 동기화 대기) */
    if (!isCreate) {
      await new Promise(r => setTimeout(r, 1200));
      const ids = Object.keys(this.members);
      if (ids.length < 2) { this.leave(); throw new Error('존재하지 않는 방 코드입니다.'); }
      if (ids.length > this.maxPlayers) { this.leave(); throw new Error('방 정원이 가득 찼습니다.'); }
    }
    return this.code;
  },

  isHost() {
    const ids = Object.keys(this.members);
    if (ids.length === 0) return false;
    /* joinedAt이 가장 빠른 사람이 호스트 (동률이면 id 순) */
    ids.sort((a, b) =>
      (this.members[a].joinedAt - this.members[b].joinedAt) || a.localeCompare(b));
    return ids[0] === this.playerId;
  },

  send(event, payload) {
    this.channel && this.channel.send({ type: 'broadcast', event, payload });
  },

  startGame() {
    const seed = (Math.random() * 2 ** 31) | 0;
    const players = Object.keys(this.members).map(id => ({
      id, nickname: this.members[id].nickname,
    }));
    const payload = { seed, players };
    this.send('start', payload);
    return payload; /* 호스트 본인도 사용 */
  },

  leave() {
    if (this.channel) { SB.removeChannel(this.channel); this.channel = null; }
    this.members = {};
    this.code = null;
  },
};
