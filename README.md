# CAPSTONE

노트 사이의 숨은 연결을 찾아 근거와 함께 제안하는 개인 지식 그래프 노트 앱.
캡스톤디자인(1) 04분반 · 팀 `캡스톤에서 살아남기` (손의권 FE · 이종원 BE·DB · 이건 AI)

## 주간 계획

매주 목표, 일정, 사람별 할 일, 시연 체크리스트는 `TeamWorkDocs/`에 주차별 파일로 적는다 (예: `TeamWorkDocs/CAPSTONE_Week_1.md`).

## 문서

| 문서 | 내용 |
| --- | --- |
| [`spec/openapi.yaml`](spec/openapi.yaml) | 앱 ↔ 백엔드 API 계약 |
| [`spec/rules.md`](spec/rules.md) | 앱과 서버가 지켜야 하는 규칙 |
| [`docs/decisions.md`](docs/decisions.md) | 팀 결정과 이유 |
| [`TeamWorkDocs/`](TeamWorkDocs/) | 주차별 목표·일정·할 일 |
| [`ai/experiments/`](ai/experiments/) | AI 실험 계획과 결과 (실험마다 폴더 하나) |

## 저장소 구조

```
.
├── code/
│   ├── fe/     데스크톱 앱 (1주차는 웹 앱으로 개발)      담당: 손의권
│   ├── be/     백엔드 (Spring Boot)                        담당: 이종원
│   │   └── src/main/resources/db/migration/   DB 마이그레이션 (Flyway)
│   └── ai/     AI 서버 (FastAPI)와 추출 실험               담당: 이건
│       └── experiments/extract-v0/   1주차 추출 시험 계획·결과
├── docs/
│   ├── openapi.yaml   앱 ↔ 백엔드 API 계약 (이 파일이 기준)
│   ├── rules.md     앱·서버가 지켜야 하는 규칙
│   ├── decisions.md     팀 결정과 이유
│   └── diagrams/      클래스 다이어그램·ERD 등
├── TeamWorkDocs/      주차별 목표·일정·할 일
├── .github/           PR 양식, 이슈 양식, 폴더별 리뷰 담당
└── docker-compose.yml  로컬 PostgreSQL
```

## 실행 방법

필요한 것: Docker, JDK 21, Node.js 20 이상, Python 3.11 이상

```bash
# 1. DB
docker compose up -d db          # localhost:5432, DB·사용자·비밀번호 모두 capstone

# 2. 백엔드  → http://localhost:8080/api
cd be && ./gradlew bootRun   # 시작할 때 Flyway가 마이그레이션을 적용한다

# 3. 앱      → http://localhost:5173
cd fe && npm install && npm run dev

# 3-1. 백엔드 없이 앱만 개발할 때: API 계약으로 가짜 서버 실행 → http://localhost:4010
npx @stoplight/prism-cli mock spec/openapi.yaml -p 4010
#     fe/.env.local 에 VITE_API_BASE_URL=http://localhost:4010 를 넣고 npm run dev

# 4. AI 서버 → http://localhost:8000 (1주차는 /v1/health와 고정 응답 /v1/extract만)
cd ai && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && uvicorn main:app --reload --port 8000
```

## 협업 규칙

**브랜치와 PR**
- `main`은 보호한다. 직접 push하지 않고 PR로만 합친다.
- 브랜치 이름: `feat/<영역>-<내용>`, `fix/<영역>-<내용>` (예: `feat/fe-topic-tree`, `fix/be-title-unique`)
- PR은 1명 이상 승인 후 Squash merge. 리뷰 담당은 `.github/CODEOWNERS`가 폴더별로 자동 지정한다.
- PR 하나는 이슈 하나. PR 본문에 `closes #번호`를 적는다.
- 커밋 메시지: `[fe] 주제 트리 펼치기·접기`처럼 영역을 앞에 붙인다.

**API 계약**
- `spec/openapi.yaml`이 기준이다. 구현이 계약과 다르면 구현을 고친다.
- 계약을 바꿔야 하면 `openapi.yaml`을 고치는 PR을 먼저 올리고 FE·BE 둘 다 승인한다.

**DB**
- 스키마 변경은 새 마이그레이션 파일(`V2__...sql`)로만 한다. 이미 `main`에 합쳐진 마이그레이션은 고치지 않는다.

**데이터**
- 팀원 노트 등 개인 데이터는 `ai/data/private/`에 두고 커밋하지 않는다 (`.gitignore`에 포함).
- `.env`는 커밋하지 않는다.
