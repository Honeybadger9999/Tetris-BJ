/* config.js
 * Supabase 프로젝트 생성 후 아래 두 값을 채워 넣으세요.
 * (Supabase 대시보드 > Project Settings > API)
 * 값이 비어 있으면: 싱글 플레이는 정상 동작, 랭킹/대전 모드만 비활성화됩니다.
 */
'use strict';

const SUPABASE_URL = 'https://poutdeqosfmktfkatlhw.supabase.co';       // 예: 'https://xxxxxxxx.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_odKoX3XNzcb9MVbjUMpCVw_MKa2wYs4';  // 예: 'eyJhbGciOi...'

const SB = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
