# TODO (FE)

- 기준일: 2026-11-07
- 확인한 커밋
  - fe `origin/main` `20b9a64`
  - docs `origin/main` `71c4f80` (11/04 회의록 포함). 추천 API 초안: `origin/docs/8-gcp-operations-handoff` `4040f7a` (docs PR #17 병합 대상)
  - be `origin/main` `5e04ba7`
- 다음 일정: 3차 멘토링 **2026-11-12(목) 22:00** 온라인, 파이널 데모 **2026-12-04(금)** (docs `product/overview.md`, `team/current-decisions.md`)

줄 번호는 위 커밋 기준이다. 회의록 = `../docs/team/meetings/2026-11-04-meeting.md`, 초안 계약 = docs `docs/8-gcp-operations-handoff:api/openapi.yaml`.

---

## A. 병합 대기 (사람이 할 일)

에이전트는 리뷰·병합하지 않는다. 아래 PR이 병합되기 전에 같은 파일을 고치는 작업은 그 브랜치 위에서 시작하고 PR 설명에 base를 적는다.

- [ ] **#26** `feat/graph-no-topic-groups` → `main`: 페이지 그래프의 주제별 묶음 배치 제거 (회의록 19행)
- [ ] **#28** `feat/recommend-merge` → `main`: 다시 분석해도 카드 유지, 새 추천 합치기, 지금 보는 카드와 그 앞 고정, 최대 5장 (회의록 15행, 57~59행)
- [ ] **#29** `feat/recommend-stale` → `feat/recommend-merge`: stale·evidence_lost 카드 알림, 버튼 3개 모두 비활성, 넘기면 제거, 새 revision이면 "내용이 갱신되었습니다" (회의록 13·14행, 60~64행)
  - 순서: **#28 병합 → #29의 base를 `main`으로 바꾸고 병합**
- [ ] **#30** `feat/evidence-quote` → `main`: 근거 문장 `EvidenceQuote` 공통 컴포넌트 (커밋 제목의 `#27`은 Issue 번호로 보임, PR 번호는 #30)
  - #30과 #28·#29가 모두 `src/features/recommend/RecommendPanel.tsx`를 고친다. 나중에 병합하는 쪽에서 충돌을 풀어야 한다.

---

## B. 바로 할 수 있는 FE 작업 (우선순위 순)

### B1. 분석(추천) 트리거를 11/04 규칙으로 바꾸기

- [x] 구현 (#32)
- [ ] BE Issue 초안 (호출 경로)

- **근거**: 회의록 11행(마지막 입력 후 5초, 계속 입력 중이면 최대 30초마다), 12행(노트 이동 시 다시 분석하지 않음, 이전 노트 타이머는 끄지 않음), 21행(업로드·작성 시 제안).
- **지금**: `src/data/queries.ts`의 `useScheduleRecommendations`가 **저장 성공** 뒤 5초(`RECOMMEND_AFTER_SAVE_MS`) 동안 저장이 없으면 `POST /notes/{id}/recommendation-jobs`를 부른다(`src/features/editor/NoteEditor.tsx` `onSaved`). 30초 상한과 "변경 없으면 생략"은 없다. 가져오기 완료 트리거는 `src/features/import/useImportRunner.ts`에 있다. 노트별 타이머라 노트를 옮겨도 이전 타이머는 남는다.
- **할 일**
  - 기준을 저장이 아니라 **입력**으로: 마지막 입력 후 5초 유휴면 요청. 계속 입력하면 첫 입력부터 최대 30초마다 한 번.
  - 요청 시점에 내용이 아직 저장되지 않았으면 저장이 끝난 뒤 요청한다(BE는 저장된 내용으로 분석한다).
  - 마지막으로 요청한 노트 `version`과 같으면 요청하지 않는다(변경 없으면 생략).
  - 가져오기 완료 트리거는 유지.
  - 노트를 옮겨도 이전 노트 타이머 유지(지금 동작 유지, 테스트로 고정).
  - 5초·30초는 상수로 둔다(실측 후 조정한다고 했음).
- **완료 기준 (mock, vitest fake timer)**
  - 입력 후 5초 동안 입력이 없으면 요청 1번.
  - 4초 간격으로 40초 계속 입력하면 30초 시점에 1번, 멈춘 뒤 5초에 1번.
  - 타이머가 끝났을 때 노트 `version`이 마지막으로 요청한 `version`과 같으면 요청 없음.
  - A 노트 입력 직후 B 노트로 옮기면 5초 뒤 A에 대해 1번 요청, B에는 요청 없음.
  - 마크다운 가져오기 완료 시 노트마다 1번.
  - `--ai-off`에서는 요청하지 않음(`discoveriesEnabled` 확인, 지금 동작).
- **막히는 것**: 호출 경로. FE는 초안의 `POST /notes/{id}/recommendation-jobs`(초안 계약 1375행)를 쓰지만, docs `main` 계약과 be `main`에는 `POST /notes/{id}/analysis`만 있다(be는 항상 503 `AI_UNAVAILABLE`). 경로는 바꾸지 말고 타이밍만 고친다. BE Issue 초안에 "분석과 추천 작업을 하나로 볼지, 추천 작업 경로를 만들지"를 묻는다.

### B2. 분석 실패와 추천 없음 화면 분리

- [x] 화면·상태 분기 (#33: docs PR #22의 `RecommendationJob.outcome`으로 구분)
- [x] BE Issue 초안 (오류 코드) — BE #74

- **근거**: 회의록 20행(BE가 구분해 서로 다른 오류 코드로 전달, FE가 화면을 다르게).
- **지금**: 초안 계약 2689행은 "실패·보류·결과 없음은 completed + 빈 recommendations"(10/30 실패 비노출)이라 FE가 구분할 수 없다. 11/04 결정과 충돌한다.
- **할 일**: 패널에 "추천 없음"과 "분석 실패" 두 상태를 만든다. 구분 값은 `src/api/`에 상수 하나로 둔다(예: 실패 오류 코드 상수, 주석에 "BE 확정 전 가정"). 문구는 Figma에 있으면 그대로, 없으면 기존 코드 말투로 쓰고 PR 설명에 적는다.
- **완료 기준 (mock)**: mock에 실패 응답을 낼 방법을 추가(기존 `--fail-analysis`를 추천 작업에도 적용하거나 새 옵션) → 실패 화면이 보인다. 빈 결과면 추천 없음 화면이 보인다. `--ai-off`의 "아직 사용할 수 없습니다"와도 다르다.
- **막히는 것**: 오류 코드와 응답 모양(작업 `status: failed`인지, `error.code`인지) 미정. 상수만 바꾸면 되도록 둔다.

### B3. "이해함" 뒤 문서 반영 허용 흐름

- [ ] 화면 (계약 없으면 화면만)
- [ ] BE Issue 초안

- **근거**: 회의록 16행("이해함"은 시스템 그래프에 반영, 문서에는 사용자가 허용할 때만).
- **지금**: "이해함"은 `POST /recommendations/{id}/feedback` `{action: understood}`만 보낸다(초안 계약 1484행). 초안 1495행: "페이지에 반영할 위치와 방식은 나중에 결정". 문서에 넣는 API는 없다.
- **할 일**: "이해함" 뒤 "문서에 추가할까요?" 같은 허용 단계 화면만 만든다. 넣을 위치(P·Q·새 페이지)는 미정이므로 고르지 않고 TODO로 둔다. API 호출은 하지 않는다.
- **완료 기준 (mock)**: "이해함" → 허용 화면 → "추가 안 함"이면 다음 카드, "추가"는 비활성 또는 TODO 안내. 기존 피드백 전송은 그대로.
- **막히는 것**: 반영 API·위치 결정(BE·팀). 화면 문구(Figma 미확인).

### B4. 추천 `status`·`revision`·후보 지문을 계약에 반영

- [x] 계약 반영: BE가 docs PR #22(`docs/8-gcp-operations-handoff`에 병합)로 `freshness`·`revision`·409 `RECOMMENDATION_STALE`·`REVIEW_CONFLICT`를 정했다. FE는 #33에서 맞췄다. 아래는 기록용
- [ ] docs PR 초안
- 관련 BE Issue: #75(후보 지문·revision), #77(근거 상태·409). #77 작업 범위에 openapi.yaml 반영이 들어 있어서, 명세 PR을 FE와 BE 중 누가 쓸지는 11/11 회의에서 정함

- **근거**: 회의록 55~64행(후보 지문, 같은 지문이면 id 유지·revision 증가, stale·evidence_lost).
- **지금**: `feat/recommend-stale`(#29)의 `src/api/types.ts`가 `Recommendation`에 `status?: 'current' | 'stale' | 'evidence_lost'`, `revision?: number`를 가정 필드로 덧붙였다. 초안 계약 `Recommendation`(2709행)에는 없다. 참고로 초안의 `DraftInsight`에는 `revision`과 `freshness: current | stale | evidence_lost`가 이미 있다.
- **할 일**: docs PR 초안을 쓴다(올리지 않음). `Recommendation`에 `revision`, 상태 필드(이름은 `DraftInsight.freshness`와 맞출지 함께 제안), stale 추천에 답하면 409 오류 코드, 후보 지문은 BE 내부 값이라 응답에 넣지 않음을 적는다. 계약이 바뀌면 FE 필드 이름을 맞춘다.
- **막히는 것**: #29 병합(같은 파일). 필드 이름은 BE·docs 리뷰로 정해진다.

---

## C. 다른 쪽 결정 대기

형식: 항목 — 담당 — 원자료

- [ ] 분석/추천 호출 경로(`analysis` vs `recommendation-jobs`), 추천 API를 docs `main`에 올릴지 — BE·docs — 회의록 11행, docs PR #17
- [x] 분석 실패 / 추천 없음 오류 코드 — BE — 회의록 20행 (docs PR #22: `outcome`)
- [ ] 동시성 S1~S4 — BE — 회의록 38·44~49행
- [ ] "이해함"의 문서 반영 위치·방식, API — BE·팀 — 회의록 16행, 초안 계약 1495행
- [ ] 챗봇 멀티턴·스트리밍·중지·시간 제한 — AI 구현 완료, 공개 API는 BE #78 — 회의록 41행
- [ ] 분석 버튼 위치 — 팀(다음 회의) — 회의록 10행
- [ ] 지원 파일 형식 — 팀(OCR 이후) — 회의록 42행
- [ ] `GET /graph` 엣지 계산·`sharedKeywords`·응답 크기 — BE — 회의록 18·24~31행
- [ ] 추천 카드 중복·순서 제안(후보 지문) 채택 여부 — 팀·BE — 회의록 39·51~64행
- [ ] 글꼴 — 팀(디자인) — 미확인 (회의록에 없음)
- [ ] 챗봇 답변 중·실패 상태 디자인 — 팀(디자인) — 미확인 (Figma 확인 안 함)
- [x] 추천 status·revision 명세 PR 작성 주체 (FE 초안 vs BE #77) — 팀 — 11/11 회의 (BE가 docs PR #22로 작성)

## D. FE가 정할 것

- [ ] 그래프 데이터의 `topics` 유지 여부와 주제 없이 배치하는 방식 (회의록 31행). 정하면 docs PR 초안으로 계약의 `TBD: topics 유지 여부`(`src/api/schema.gen.ts`에 남은 주석)를 정리한다. #26 병합 뒤 진행.
- [x] B1의 30초 상한을 어디부터 셀지 — 2026-11-10 확정: 마지막 요청(또는 처음) 뒤의 첫 입력부터 (#32)
