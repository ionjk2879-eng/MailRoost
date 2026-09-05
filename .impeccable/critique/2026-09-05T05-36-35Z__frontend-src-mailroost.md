---
target: MailRoost 전체 화면 구조/컨셉 방향성
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\User\\IdeaProjects\\MailRoost\\frontend\\src (MailRoost 전체 화면 구조)"
timestamp: 2026-09-05T05-36-35Z
slug: frontend-src-mailroost
---
**Method: dual-agent (A: design-review subagent · B: detector/browser subagent)**

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | 성공 확인(토스트) 없음 — 목록 변화로만 유추 |
| 2 | Match System / Real World | 3 | "AI 요약" 라벨이 없는 기능을 약속 |
| 3 | User Control and Freedom | 3 | 삭제/보관 후 실행취소 없음 |
| 4 | Consistency and Standards | 3 | 아이콘/색 토큰은 일관, 분류/카테고리/계정 3개념이 겹침 |
| 5 | Error Prevention | 3 | 비가역 동작에만 확인창 — 적절 |
| 6 | Recognition Rather Than Recall | 2 | 메일 상세 툴바 11개 아이콘 전부 아이콘만 |
| 7 | Flexibility and Efficiency | 3 | 키보드 내비/다중선택/드래그정렬 풍부 |
| 8 | Aesthetic and Minimalist Design | 2 | 홈 대시보드·툴바 위계 없이 밀도만 높음 |
| 9 | Error Recovery | 4 | 네이버 연결오류 배너가 원인을 정직하게 설명 |
| 10 | Help and Documentation | 1 | Ctrl+/ 외 도움말 존재 자체가 안 보임 |
| **Total** | | **27/40** | **Acceptable (상위권)** |

## Design Specificity Verdict

로그인 전/후 극명하게 갈림. 랜딩(`landing-view.tsx`)은 제품 고유 카피, 로그인 후 `home-view.tsx`는 브랜드 빼면 범용 SaaS 대시보드. PRODUCT.md 핵심 원칙("계정 하나 실패해도 나머지는 정상")이 홈 화면에 반영 안 됨. `home-view.tsx`의 "AI 요약" 카드는 `memo-view.tsx`(평범 메모장)로 연결 — 없는 기능 약속.

결정론적 스캔: `detect.mjs` finding 1개(`message-card.tsx:98`) — A/B 둘 다 독립적으로 false positive 판정(email HTML 정제 정규식 문자열이 우연히 매칭). 실제 UI 결함 0건.

브라우저 확인: 인증 화면은 Chrome 확장 미연결로 캡처 불가. 정적 검증: PWA 아이콘/OG 이미지 전부 선언 크기와 일치, 브랜드 오렌지(#EA580C, favicon과 의도적 매칭) OKLCH 색 토큰이 라이트/다크 일관.

## Overall Impression

랜딩은 제품의 이야기를 하는데 로그인하는 순간 정체성 없는 대시보드로 떨어지고, 그 첫 카드가 없는 기능을 약속. 가장 큰 기회: 홈을 "허영 지표"에서 "지금 이 계정이 괜찮은가"로 전환.

## What's Working

1. 네이버 연결오류 배너 — 원인을 정직하게 설명, 톤도 적절.
2. 키보드 중심 파워유저 경로 — J/K, 다중선택, 드래그 정렬 등 1인 프로젝트 치고 매우 풍부.
3. 비례적인 오류 방지 — 비가역 동작에만 확인창.

## Priority Issues

**[P1] 홈 "AI 요약" 카드가 없는 기능을 약속**
- What: `home-view.tsx:81`이 실제로는 메모장(`memo-view.tsx`)으로 연결.
- Why it matters: 로그인 직후 신뢰 붕괴 — 포지셔닝(정직함)과 정반대.
- Fix: 라벨을 실제 기능으로 수정하거나 기능 완성 전까지 카드 제거.
- Suggested command: /impeccable clarify

**[P1] 메일 상세 툴바 11개 아이콘 벽**
- What: `message-card.tsx:177-314` 구분 없는 한 줄.
- Why it matters: Recognition/Cognitive-load 위반, 최근 회귀.
- Fix: 답장군/상태군/정리군 구분, 저빈도 항목은 오버플로 메뉴로.
- Suggested command: /impeccable layout

**[P2] 홈 대시보드가 목적과 무관한 범용 스탯 템플릿**
- What: 스탯 타일 5개, 계정별 상태 없음.
- Why it matters: 핵심 차별점이 홈에 없음.
- Fix: 계정별 정상/응답없음 상태 전면 배치로 재설계.
- Suggested command: /impeccable shape

**[P2] 사이드바 "메일" 그룹 9개 항목 무구분 나열**
- What: `account-sidebar.tsx:254-369`.
- Why it matters: 그룹화 권장 기준(≤5) 초과.
- Fix: 소제목으로 받은편지함류/도구류 분리.
- Suggested command: /impeccable layout

**[P3] 스누즈/뮤트 화면 죽은 링크**
- What: `snooze-mute-view.tsx:196` onClick 없음.
- Why it matters: 작지만 신뢰를 깎는 데드엔드.
- Fix: 연결하거나 제거.
- Suggested command: /impeccable harden

## Persona Red Flags

**Alex(파워유저)**: 11개 아이콘 툴바가 스캔 마찰. 보관/스누즈/작성 단축키 없음.
**Jordan(첫 사용자)**: "AI 요약"에 바로 속음. 카테고리/분류/계정 3체계 공존이 혼란.
**정민(PRODUCT.md 개인 사용자)**: 연결오류 배너는 좋으나, 계정별 지속 상태 표시가 없어 놓치면 원인 파악 불가.

## Minor Observations

- 빈 상태 새 둥지 일러스트는 브랜드가 살아있는 유일한 지점, 한 번만 보임.
- 작성 화면 CC/BCC/주소록 토글이 좁은 화면에서 빽빽함.
- 알림음 "새 지저귐"은 브랜드와 잘 맞는 디테일.
- 헤더에 Ctrl+/ 존재를 암시하는 게 없음.

## Questions to Consider

1. 홈 화면을 "허영 지표"에서 "계정별 상태" 중심으로 뒤집으면 어떤 모습일까?
2. 툴바가 3개→11개로 늘어난 걸 막을 지점이 필요하지 않을까?
3. 로그인 후 브랜드가 거의 사라진 건 의도한 선택인가, 잊힌 것인가?
