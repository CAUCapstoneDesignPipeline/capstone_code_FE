# AGENTS.md

이 저장소(capstone_code_FE)에서 일하는 코딩 에이전트용 안내. 실행·설치 방법은 [README.md](README.md)를 본다. 다음에 할 일은 [TODO.md](TODO.md)에 있다.

## 수정 범위

- 이 저장소(fe)만 고친다. docs·be·ai 저장소는 읽기만 한다.
- 다른 저장소에 필요한 것은 그 저장소의 Issue로 요청한다. 직접 고치지 않는다.
- docs의 계약(`api/openapi.yaml`·`api/rules.md`)을 바꿔야 하면 docs PR로 제안한다.
- 에이전트는 다른 저장소의 Issue·PR **초안만** 쓴다(본문 텍스트를 PR 설명이나 보고에 붙인다). 직접 올리지 않는다. 올리는 것은 사람이 한다.

## 먼저 읽을 것 (위가 우선)

1. [TODO.md](TODO.md): 지금 할 일과 막힌 것.
2. `../docs/team/meetings/`의 최신 회의록 (지금은 `2026-11-04-meeting.md`).
3. `../docs/api/openapi.yaml`·`../docs/api/rules.md`: FE↔BE 계약.
4. `../docs/team/current-decisions.md`: 기준일이 2026-10-30이라 11/04 결정과 다른 곳이 있다.
   예: O01은 "5초/30초를 합의로 고정하지 않음"이지만 11/04 회의에서 "마지막 입력 후 5초, 계속 입력 중이면 최대 30초마다"로 시작하기로 정했다.

내용이 서로 다르면 **최신 회의록**을 따른다. 회의록에 없는 것은 계약 → current-decisions 순서로 본다.

참고: 추천·그래프 API(`/notes/{id}/recommendation-jobs`, `/recommendations/{id}/feedback` 등)는 docs `main`에 없고, docs PR #17(v0.4.0-draft)이 병합된 `docs/8-gcp-operations-handoff` 브랜치에만 있다. `src/api/schema.gen.ts`는 그 초안으로 만들어졌다. `npm run gen:api`는 기본으로 `../capstone_docs/api/openapi.yaml`을 읽으므로 이 작업 공간에서는 `DOCS_CONTRACT_PATH=../docs/api/openapi.yaml`처럼 경로를 준다. 어느 브랜치의 계약으로 만드는지 PR 설명에 적는다.

## 용어

| 용어               | 뜻                                                                      |
| ------------------ | ----------------------------------------------------------------------- |
| 페이지             | 문서(노트) 하나                                                         |
| 키워드             | 그래프의 노드 하나                                                      |
| 개념               | 키워드 안에 들어 있는 설명                                              |
| 새로운 지식 / 추천 | "사용자가 모르는 지식". 두 페이지의 근거 문장과 외부 지식으로 만든 결론 |

- 추천 카드 버튼 문구는 **"이해함" / "알고 있던 내용" / "이해가 안 됨"**이다. 계약 값은 `understood` / `known` / `confused`.
- 화면 문구는 Figma(팀 파일 CAPSTONE)와 기존 코드를 따른다. 새 문구를 지어내지 않는다. Figma에 없으면 기존 코드의 말투에 맞추고 PR 설명에 적는다.

## 하지 말 것

- 계약에 없는 필드·경로를 새로 지어내지 않는다. 새 가정이 꼭 필요하면 "계약 반영 전 가정" 주석을 달고 TODO.md와 PR 설명에 적는다. (추천의 `status`·`revision` 가정 필드는 docs PR #22의 `freshness`·`revision`으로 바뀌었다, #33)
- 아래 미결 항목은 구현하지 않는다. 코드에 `TODO`로 남기고 TODO.md의 해당 항목을 가리킨다.
- 오류 분기는 HTTP 상태가 아니라 `error.code`로 한다(README "지켜야 할 것").

### 미결 항목 (구현하지 않음)

- 분석 버튼 위치 (11/04: 나중에 추가, 다음 회의에서 논의)
- 챗봇 답변 중·실패 상태의 디자인 (지금은 기존 Banner·말풍선으로 최소한만 보인다, #34)
- 글꼴
- 그래프 데이터의 `topics` 유지 여부 (FE가 정할 항목, TODO.md D)
- 지원 파일 형식 (OCR 이후 논의)
- 동시성 S1~S4 (BE 결정 대기)

## 확인 방법

- 가짜 서버: `npm run mock` (옵션은 [README.md](README.md)와 `mock/server.mjs` 맨 위 주석)
  - `--ai-off`: 지금 BE처럼 `/capabilities`가 모두 false, 분석 503 `AI_UNAVAILABLE`, 그래프·추천 경로 404
  - `--fail-analysis`: 분석이 모두 실패 (추천 작업도 `RECOMMENDATION_FAILED`)
  - `--external-knowledge`: 추천에 예시 외부 지식 (기본 `null`)
  - `--chat-off`: 추천 챗봇 503. 챗봇 질문에 `끊김`을 넣으면 답 중간에 `CHAT_INTERRUPTED`
  - `--delay <ms>`: 모든 응답을 늦춤 (저장 중·요청 겹침 확인)
- 끝내기 전에 반드시: `npm run typecheck && npm test && npm run lint`
- 실제 BE(`be` main)에는 그래프·추천·변환 API가 없다(분석도 항상 503). 그래서 "실제 BE에서 동작 확인"이라고 보고하지 않는다. mock에서 확인한 시나리오를 적는다.

## 브랜치·PR·커밋

- 작업마다 `origin/main` 기준 새 브랜치를 만든다(`feat/<영역>-<내용>`, `fix/...`, 문서는 `docs/...`).
- 병합 전 PR 위에 쌓아야 하면 그 브랜치에서 따고, PR 설명에 base 브랜치와 PR 번호를 적는다.
- PR 하나에 작업 하나.
- 커밋 메시지: `[fe] ...` (예: `[fe] 추천 카드: 근거가 바뀐 카드 처리`).
- `main`은 보호된다. 직접 push하지 않는다.
