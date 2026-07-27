# TETRIS BATTLE

바닐라 JS + Canvas 테트리스. 싱글 플레이, 1:1 대결, 최대 4인 멀티 대결, 주간/역대 랭킹을 지원합니다.
서버 코드 없이 **GitHub Pages(호스팅) + Supabase(랭킹 DB + 실시간 대전)** 만으로 동작합니다.

## 기능

- 싱글 플레이: 7-bag 랜덤, SRS 회전(벽차기), 고스트 피스, Next 5개, Hold, 레벨업 속도 증가
- 1:1 대결 / 멀티 대결(최대 4인): 방 코드 공유로 참가, 같은 블럭 순서(공정한 시드), 줄 삭제 시 상대에게 가비지 라인 공격, 최후 생존자 승리
- 랭킹: 싱글 모드 점수 자동 등록, "이번 주"(매주 월요일 리셋) / "역대 최고" 탭
- 조작: ← → 이동, ↑/X 회전, Z 역회전, ↓ 소프트드롭, Space 하드드롭, C/Shift 홀드, P 일시정지. 터치 기기에서는 화면 버튼 표시

## 배포 순서 (약 10분)

### 1단계. Supabase 설정

1. https://supabase.com 가입 → **New project** 생성 (Free 플랜이면 충분)
2. 왼쪽 메뉴 **SQL Editor** → 이 저장소의 `supabase.sql` 내용 붙여넣기 → **Run**
3. 왼쪽 메뉴 **Project Settings > API** 에서 두 값 복사:
   - Project URL
   - anon public 키
4. `js/config.js` 를 열어 두 값을 붙여넣기:

```js
const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

> anon 키는 공개되어도 되는 키입니다. 데이터 보호는 RLS 정책(supabase.sql)이 담당합니다.

### 2단계. GitHub Pages 배포

1. GitHub에서 새 저장소 생성 (예: `tetris-battle`, Public)
2. 이 폴더의 모든 파일을 업로드 (웹에서 드래그 업로드 또는 `git push`)
3. 저장소 **Settings > Pages** → Source: **Deploy from a branch** → Branch: `main` / `/ (root)` → Save
4. 1~2분 후 `https://<아이디>.github.io/tetris-battle/` 접속

이후에는 파일을 수정해 push만 하면 자동으로 재배포됩니다.

### 동작 확인 체크리스트

- [ ] 싱글 플레이 정상 동작 (Supabase 없이도 동작함)
- [ ] 게임 오버 후 "랭킹에 등록되었습니다" 표시 → 랭킹 화면에서 확인
- [ ] 브라우저 창 2개로 1:1 대결: 방 만들기 → 코드 입력 참가 → 시작 → 줄 삭제 시 상대 화면에 회색 가비지 라인 확인

## 구조

```
index.html          화면 구조 (메뉴/게임/대기실/랭킹)
css/style.css       아케이드 다크 테마
js/config.js        Supabase URL/키 (직접 입력)
js/engine.js        테트리스 코어 로직 (보드, 회전, 점수, 가비지)
js/app.js           렌더링, 입력, 모드 진행, 랭킹 UI
js/net.js           Supabase Realtime 방 생성/참가/브로드캐스트
js/leaderboard.js   점수 저장, 주간/역대 랭킹 조회
supabase.sql        DB 테이블 + RLS 정책
```

## 게임 규칙 요약

- 점수: 1줄 100 / 2줄 300 / 3줄 500 / 테트리스 800 (×레벨), 소프트드롭 +1/칸, 하드드롭 +2/칸
- 레벨: 10줄마다 +1, 낙하 속도 15%씩 빨라짐
- 대전 공격: 2줄 삭제 → 1줄, 3줄 → 2줄, 테트리스 → 4줄 가비지 전송. 받은 가비지는 줄을 지우면 상쇄
- 랭킹에는 싱글 모드 점수만 등록됩니다 (대전은 인원에 따라 유불리가 있어 별도 집계하지 않음)

## 알아두면 좋은 것

- Supabase Free 플랜: Realtime 동시 접속 200명, DB 500MB → 취미 규모에는 충분
- 랭킹은 닉네임 기반이라 동일 닉네임은 같은 사람으로 집계됩니다. 조작 방지가 필요해지면 익명 인증으로 업그레이드 가능
- 프로젝트가 1주간 미사용 시 Supabase Free 프로젝트가 일시정지될 수 있음 → 대시보드에서 Restore 버튼 한 번이면 복구
