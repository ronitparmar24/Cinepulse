-- CinePulse v10: Interest Feedback Loop & Learned Taste Affinity
-- Supabase / PostgreSQL Migration

CREATE TABLE IF NOT EXISTS public.interest_feedback (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  signal TEXT NOT NULL CHECK(signal IN ('interested', 'not_interested', 'already_seen', 'snooze')),
  reason TEXT CHECK(reason IS NULL OR reason IN ('not_my_genre', 'too_violent', 'seen_it', 'not_into_actor_director', 'language', 'too_long', 'other')),
  surface TEXT NOT NULL DEFAULT 'discovery',
  title_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, title_id)
);

CREATE INDEX IF NOT EXISTS idx_interest_feedback_user_signal
  ON public.interest_feedback(user_id, signal);

CREATE INDEX IF NOT EXISTS idx_interest_feedback_user_updated
  ON public.interest_feedback(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.interest_feedback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('set', 'undo', 'update')),
  previous_signal TEXT,
  new_signal TEXT,
  previous_reason TEXT,
  new_reason TEXT,
  surface TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interest_feedback_events_user
  ON public.interest_feedback_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_affinity (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_type TEXT NOT NULL CHECK(feature_type IN ('genre', 'director', 'actor', 'language', 'decade', 'runtime_bucket', 'keyword', 'media_type')),
  feature_value TEXT NOT NULL,
  weight DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, feature_type, feature_value)
);

CREATE INDEX IF NOT EXISTS idx_user_affinity_user_weight
  ON public.user_affinity(user_id, weight DESC);

CREATE INDEX IF NOT EXISTS idx_user_affinity_user_type
  ON public.user_affinity(user_id, feature_type);

-- Row Level Security: users read and write only their own rows
ALTER TABLE public.interest_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own interest feedback" ON public.interest_feedback;
CREATE POLICY "users manage own interest feedback" ON public.interest_feedback
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.interest_feedback_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own interest feedback events" ON public.interest_feedback_events;
CREATE POLICY "users manage own interest feedback events" ON public.interest_feedback_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.user_affinity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users manage own affinity" ON public.user_affinity;
CREATE POLICY "users manage own affinity" ON public.user_affinity
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
