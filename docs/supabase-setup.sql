-- ====================================================
-- MomentumSheet — Supabase 테이블 생성
-- Supabase SQL Editor에서 실행
-- ====================================================

-- 매매일지
CREATE TABLE IF NOT EXISTS journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy TEXT NOT NULL CHECK (strategy IN ('swing', 'sector')),
  ticker_code TEXT NOT NULL,
  ticker_name TEXT NOT NULL,
  buy_date DATE NOT NULL,
  buy_price INTEGER NOT NULL,
  buy_qty INTEGER NOT NULL,
  buy_amount INTEGER NOT NULL,
  sell_date DATE,
  sell_price INTEGER,
  sell_amount INTEGER,
  profit_loss INTEGER,
  profit_rate NUMERIC(8,2),
  close_reason TEXT,
  pool_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 스크리닝 이력
CREATE TABLE IF NOT EXISTS screening_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy TEXT NOT NULL CHECK (strategy IN ('swing', 'sector')),
  screen_date DATE NOT NULL,
  year INTEGER NOT NULL,
  week_num INTEGER,
  week_label TEXT,
  month_num INTEGER,
  month_label TEXT,
  result JSONB NOT NULL,
  selected_ticker TEXT,
  selected_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 스윙: 같은 연도+주차에 하나의 결과만 저장
CREATE UNIQUE INDEX IF NOT EXISTS uq_swing_week
  ON screening_history (strategy, year, week_num)
  WHERE strategy = 'swing';

-- 섹터: 같은 연도+월에 하나의 결과만 저장
CREATE UNIQUE INDEX IF NOT EXISTS uq_sector_month
  ON screening_history (strategy, year, month_num)
  WHERE strategy = 'sector';

-- 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_history_swing
  ON screening_history (strategy, year DESC, week_num DESC)
  WHERE strategy = 'swing';

CREATE INDEX IF NOT EXISTS idx_history_sector
  ON screening_history (strategy, year DESC, month_num DESC)
  WHERE strategy = 'sector';

-- 매매일지 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_journal_strategy
  ON journal (strategy, buy_date DESC);

-- 한투 API 토큰 (항상 1행만 유지)
CREATE TABLE IF NOT EXISTS kis_token (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW()
);
