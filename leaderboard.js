/* leaderboard.js - 싱글 모드 점수 저장 및 랭킹 조회 */
'use strict';

const Leaderboard = {
  available() { return !!SB; },

  async submit(nickname, score, lines, level) {
    if (!SB || score <= 0) return;
    await SB.from('scores').insert({ nickname, score, lines, level });
  },

  /* period: 'all' | 'week'  → 닉네임별 최고 점수 상위 10명 */
  async top(period) {
    if (!SB) return [];
    let q = SB.from('scores')
      .select('nickname, score, lines, level, created_at')
      .order('score', { ascending: false })
      .limit(100);
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
