/* leaderboard.js - 싱글 모드 점수 저장 및 랭킹 조회 */
'use strict';

const Leaderboard = {
  available() { return !!SB; },

  /* true로 바꾸면 닉네임당 최고 기록 1개만 표시 (기존 방식) */
  BEST_PER_NICKNAME: false,

  async submit(nickname, score, lines, level) {
    if (!SB || score <= 0) return;
    const { error } = await SB.from('scores').insert({ nickname, score, lines, level });
    if (error) throw error;
  },

  /* period: 'all' | 'week'  → 상위 10개 기록 */
  async top(period) {
    if (!SB) return [];
    let q = SB.from('scores')
      .select('nickname, score, lines, level, created_at')
      .order('score', { ascending: false })
      .limit(this.BEST_PER_NICKNAME ? 100 : 10);
    if (period === 'week') {
      const now = new Date();
      const day = (now.getDay() + 6) % 7; /* 월요일 시작 */
      const monday = new Date(now);
      monday.setDate(now.getDate() - day);
      monday.setHours(0, 0, 0, 0);
      q = q.gte('created_at', monday.toISOString());
    }
    const { data, error } = await q;
    if (error || !data) return [];
    if (!this.BEST_PER_NICKNAME) return data;
    const seen = new Set(), out = [];
    for (const row of data) {
      if (seen.has(row.nickname)) continue;
      seen.add(row.nickname);
      out.push(row);
      if (out.length >= 10) break;
    }
    return out;
  },
};
