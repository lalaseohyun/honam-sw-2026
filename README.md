# 2026 호남권 SW 창업아이디어 경진대회 — 진행 웹앱

2026.9.29(화)~30(수) · 전주 왕의지밀 · 10팀 50명 · 운영 라인교육연구소

## 주소

| 화면 | 주소 | 누가 |
|---|---|---|
| **진행자 메인** | https://lalaseohyun.github.io/honam-sw-2026/main.html | 진행자 — 아래 화면들로 가는 입구 |
| 참여자 | https://lalaseohyun.github.io/honam-sw-2026/ | 조별 대표자 폰 (진행자 화면 QR) |
| 퀴즈 진행자 | https://lalaseohyun.github.io/honam-sw-2026/host.html | 진행자 노트북 → 빔프로젝터 (운영자 로그인) |
| 진행 현황판 | https://lalaseohyun.github.io/honam-sw-2026/board.html | 교수진·운영진 (로그인) |
| 진행 현황판 보기 전용 | https://lalaseohyun.github.io/honam-sw-2026/board.html?v=j4hp3ujt | 로그인 없이 현황만 참고 — 링크 받은 사람만 |
| 운영자 | https://lalaseohyun.github.io/honam-sw-2026/admin.html | 운영자 (로그인) |

## 퀴즈 진행

진행자 화면을 열면 항상 QR 대기화면부터 나온다. `Space`(또는 ▶) 하나로 끝까지 간다:
문제만 → 보기 보여주기 → 제출 현황 → 정답 공개 → 다음 문제 … → 최종 순위.

| 키 | 동작 |
|---|---|
| `Space` `→` | 다음 |
| `←` | 이전 |
| `F` | 전체화면 |
| `H` | 조작 바 숨기기 |
| `R` | 실시간 순위 패널 |

리허설 뒤 실전 전: 진행자 화면 **전체 초기화** → "대표 폰 등록도 지울까요?" **확인**.

## 파일

```
index.html   참여자 (조 선택 → 퀴즈 / 진행 제출)
host.html    퀴즈 진행자
board.html   진행 현황판
admin.html   운영자
js/data.js   조·문항·단계 — 문항 문구는 여기서 고친다
database.rules.json / storage.rules   Firebase 보안 규칙 (firebase deploy --only database,storage)
tests/       node --test tests/quiz.test.mjs tests/export.test.mjs
```

⚠ 행사 중에는 배포하지 않는다 — GitHub Pages가 파일을 10분쯤 캐시해서 일부 폰이 옛 파일과 새 파일을 섞어 불러오면 멈출 수 있다.
