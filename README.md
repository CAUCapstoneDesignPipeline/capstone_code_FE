# capstone_code_FE

CAPSTONE 노트 앱의 앱 쪽 코드. 1주차는 웹 앱(Vite + React + TypeScript)으로 브라우저에서 개발하고, 데스크톱 포장(Electron·Tauri)은 이후에 정한다.
담당: 손의권 · 할 일과 API 계약은 [capstone_docs](https://github.com/CAUCapstoneDesignPipeline/capstone_docs)에 있다.

## 실행

필요한 것: Node.js 20.19 이상. 아래 경로는 `docs`, `fe`, `be`, `ai`를 한 폴더에 나란히 클론했다고 가정한다.

```bash
npm install
cp .env.example .env.local       # API 주소 설정
npm run mock                     # 가짜 서버 http://localhost:4010 (BE 없이 개발할 때, 터미널 따로)
npm run dev                      # http://localhost:5173
```

API 주소는 `.env.local`의 `VITE_API_BASE_URL`로 정한다.

| 연결 대상                | `VITE_API_BASE_URL`         | 준비                           |
| ------------------------ | --------------------------- | ------------------------------ |
| 가짜 서버 (BE 없이 개발) | `http://localhost:4010`     | `npm run mock`                 |
| 실제 백엔드              | `http://localhost:8080/api` | capstone_be README의 실행 방법 |

가짜 서버 두 가지:

- `npm run mock`: `mock/server.mjs`. 데이터를 메모리에 기억하고 계약의 규칙(제목 중복, `/` 금지, version 충돌, 주제 삭제 충돌)을 따른다. 화면 흐름은 이것으로 확인한다. 끄면 데이터가 사라진다. `npm run mock -- --delay 500`으로 응답을 늦출 수 있다.
- `npm run mock:prism`: Prism. 계약의 예시 응답만 돌려주고 데이터를 저장하지 않는다. 응답 모양만 확인할 때 쓰고, 오류 응답은 요청 헤더 `Prefer: code=409`처럼 상태 코드를 지정해 받아 본다.

`mock`과 `dev`는 터미널을 나눠 띄운다. 한 터미널에서 Ctrl+Z로 멈추면 서버가 응답하지 않는다.

그 밖의 명령:

```bash
npm run gen:api                  # ../docs/api/openapi.yaml → src/api/schema.gen.ts (계약이 바뀌면 실행)
npm run typecheck                # 타입 검사
npm test                         # vitest
npm run lint                     # oxlint
npm run format                   # prettier로 정리 (확인만: npm run format:check)
npm run build                    # 배포용 빌드 (dist/)
```

## 지켜야 할 것

- API 요청·응답은 `docs/api/openapi.yaml`, 동작은 `docs/api/rules.md`를 따른다. 계약과 다른 응답을 받으면 바로 BE에 공유한다.
- 오류 처리는 HTTP 상태가 아니라 `error.code`로 분기한다.
- 수정 충돌: 저장 요청은 한 번에 하나, 응답의 `version`을 반영, 409·404를 받으면 자동 저장을 멈춘다.

## 협업 규칙

- `main`은 보호한다. 직접 push하지 않고 PR로만 합친다. 1명 이상 승인 후 Squash merge.
- 브랜치: `feat/<영역>-<내용>`, `fix/<영역>-<내용>` (예: `feat/sidebar-topic-tree`)
- 커밋 메시지: `[fe] 주제 트리 펼치기·접기`
- `.env`, `.env.local`은 커밋하지 않는다.
