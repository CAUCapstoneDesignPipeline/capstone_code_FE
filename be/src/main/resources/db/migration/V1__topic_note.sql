-- CAPSTONE V1: 주제와 노트 (1주차 범위)
-- 분석·후보 관련 테이블은 해당 기능을 구현하는 주에 V2 이후로 추가한다.

CREATE TABLE topic (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topic_name_unique UNIQUE (name),
  CONSTRAINT topic_name_length CHECK (char_length(name) BETWEEN 1 AND 50),
  CONSTRAINT topic_name_no_slash CHECK (position('/' IN name) = 0)
);

CREATE TABLE note (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id    uuid        REFERENCES topic(id) ON DELETE SET NULL,  -- NULL = 미분류
  title       text        NOT NULL,
  body        text        NOT NULL DEFAULT '',                       -- NFC 정규화해서 저장
  version     int         NOT NULL DEFAULT 0,                        -- 수정 충돌 검사용
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- 제목은 주제 안에서만 유일. 미분류(NULL)끼리도 중복 금지
  CONSTRAINT note_title_unique_in_topic UNIQUE NULLS NOT DISTINCT (topic_id, title),
  CONSTRAINT note_title_length CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT note_title_no_slash CHECK (position('/' IN title) = 0)
);

CREATE INDEX note_topic_idx ON note (topic_id);
CREATE INDEX note_updated_idx ON note (updated_at DESC);
