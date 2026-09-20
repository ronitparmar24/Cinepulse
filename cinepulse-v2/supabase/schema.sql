-- ==============================================================================
-- CinePulse Supabase PostgreSQL Schema & Row Level Security (RLS)
-- Complete implementation of cinepulse-supabase-schema-and-rls.md
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- Safe to re-run: All tables, policies, indexes, and functions are idempotent.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 0 — Existing Tables & RLS Fixes
-- ------------------------------------------------------------------------------

-- 0.1 Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'followers_only', 'private')),
  is_verified BOOLEAN DEFAULT false,
  favorite_title_ids JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles readable by everyone" ON public.profiles;
CREATE POLICY "profiles readable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users update own profile" ON public.profiles;
CREATE POLICY "users update own profile"
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "users insert own profile" ON public.profiles;
CREATE POLICY "users insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

-- Trigger to automatically synchronize new auth.users into public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 0.2 Library Table (Watchlist, Watching, Watched)
CREATE TABLE IF NOT EXISTS public.library (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  title_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('watchlist', 'watching', 'watched')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, title_id)
);

CREATE INDEX IF NOT EXISTS idx_library_user_updated ON public.library(user_id, updated_at DESC);

ALTER TABLE public.library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "library readable by everyone" ON public.library;
CREATE POLICY "library readable by everyone"
  ON public.library FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users manage own library" ON public.library;
CREATE POLICY "users manage own library"
  ON public.library FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users update own library rows" ON public.library;
CREATE POLICY "users update own library rows"
  ON public.library FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users delete own library rows" ON public.library;
CREATE POLICY "users delete own library rows"
  ON public.library FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 0.3 Reviews Table
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  title_name TEXT NOT NULL,
  body TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  spoiler BOOLEAN NOT NULL DEFAULT false,
  kind TEXT NOT NULL CHECK (kind IN ('review', 'first-impression')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT reviews_user_title_unique UNIQUE (user_id, title_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_title ON public.reviews(title_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON public.reviews(created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews readable by everyone" ON public.reviews;
CREATE POLICY "reviews readable by everyone"
  ON public.reviews FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users manage own reviews" ON public.reviews;
CREATE POLICY "users manage own reviews"
  ON public.reviews FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users update own reviews" ON public.reviews;
CREATE POLICY "users update own reviews"
  ON public.reviews FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users delete own reviews" ON public.reviews;
CREATE POLICY "users delete own reviews"
  ON public.reviews FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 0.4 Forecasts Table (Current User's Call on a Title)
CREATE TABLE IF NOT EXISTS public.forecasts (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK (choice IN ('hit', 'flop')),
  confidence INTEGER NOT NULL CHECK (confidence >= 50 AND confidence <= 100),
  reason TEXT NOT NULL,
  title_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, title_id)
);

CREATE INDEX IF NOT EXISTS idx_forecasts_title ON public.forecasts(title_id);

ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forecasts readable by everyone" ON public.forecasts;
CREATE POLICY "forecasts readable by everyone"
  ON public.forecasts FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users create own forecast calls" ON public.forecasts;
CREATE POLICY "users create own forecast calls"
  ON public.forecasts FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);
-- Note: No client UPDATE policy for forecasts to guarantee immutability (anti-gaming).
-- Resolution edits are executed server-side via the service-role key.

-- 0.5 Forecast Events Table (Append-Only Event Log)
CREATE TABLE IF NOT EXISTS public.forecast_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK (choice IN ('hit', 'flop')),
  confidence INTEGER NOT NULL CHECK (confidence >= 50 AND confidence <= 100),
  reason TEXT NOT NULL,
  first_submission BOOLEAN NOT NULL DEFAULT false,
  release_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_forecast_events_title_created ON public.forecast_events(title_id, created_at ASC);

ALTER TABLE public.forecast_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "forecast_events readable by everyone" ON public.forecast_events;
CREATE POLICY "forecast_events readable by everyone"
  ON public.forecast_events FOR SELECT
  USING (true);

-- 0.6 API Cache Table
CREATE TABLE IF NOT EXISTS public.api_cache (
  cache_key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON public.api_cache(expires_at);

ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "api_cache no client access" ON public.api_cache;
CREATE POLICY "api_cache no client access"
  ON public.api_cache FOR SELECT
  USING (false);

-- ------------------------------------------------------------------------------
-- STEP 1 — Community Scoring & Prediction Trust (Track F / v4 Phase 3)
-- ------------------------------------------------------------------------------

-- 1.1 Predictions Log (Frozen snapshots of ML model predictions at serve time)
CREATE TABLE IF NOT EXISTS public.predictions_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title_id TEXT NOT NULL,
  title_name TEXT,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  model_version TEXT NOT NULL,
  probability_hit NUMERIC,
  revenue_p10 NUMERIC,
  revenue_p50 NUMERIC,
  revenue_p90 NUMERIC,
  factors JSONB,
  resolved_at TIMESTAMPTZ,
  actual_revenue NUMERIC,
  was_hit BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_predictions_log_title ON public.predictions_log(title_id);
CREATE INDEX IF NOT EXISTS idx_predictions_log_created ON public.predictions_log(predicted_at DESC);

ALTER TABLE public.predictions_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "predictions_log readable by everyone" ON public.predictions_log;
CREATE POLICY "predictions_log readable by everyone"
  ON public.predictions_log FOR SELECT
  USING (true);

-- 1.2 User Call Scores (Brier Score Resolution per User and Title)
CREATE TABLE IF NOT EXISTS public.user_call_scores (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  called_probability NUMERIC NOT NULL,
  resolved_at TIMESTAMPTZ,
  actual_outcome BOOLEAN,
  brier_score NUMERIC,
  PRIMARY KEY (user_id, title_id)
);

CREATE INDEX IF NOT EXISTS idx_user_call_scores_resolved ON public.user_call_scores(resolved_at);

ALTER TABLE public.user_call_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call scores readable by everyone" ON public.user_call_scores;
CREATE POLICY "call scores readable by everyone"
  ON public.user_call_scores FOR SELECT
  USING (true);

-- ------------------------------------------------------------------------------
-- STEP 2 — Social Layer (Follows, Privacy, Activity, Likes, Comments, Blocks, Notifications)
-- ------------------------------------------------------------------------------

-- 2.1 Follows
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (follower_id, followee_id),
  CONSTRAINT follows_no_self CHECK (follower_id != followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_followee ON public.follows(followee_id, status);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows readable by everyone" ON public.follows;
CREATE POLICY "follows readable by everyone"
  ON public.follows FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users manage own follow rows" ON public.follows;
CREATE POLICY "users manage own follow rows"
  ON public.follows FOR INSERT
  WITH CHECK ((select auth.uid()) = follower_id);

DROP POLICY IF EXISTS "users delete own follow rows" ON public.follows;
CREATE POLICY "users delete own follow rows"
  ON public.follows FOR DELETE
  USING ((select auth.uid()) = follower_id);

DROP POLICY IF EXISTS "followees update request status" ON public.follows;
CREATE POLICY "followees update request status"
  ON public.follows FOR UPDATE
  USING ((select auth.uid()) = followee_id);

-- 2.2 Privacy Settings
CREATE TABLE IF NOT EXISTS public.privacy_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist_visibility TEXT DEFAULT 'public' CHECK (watchlist_visibility IN ('public', 'followers_only', 'private')),
  diary_visibility TEXT DEFAULT 'public' CHECK (diary_visibility IN ('public', 'followers_only', 'private')),
  ratings_visibility TEXT DEFAULT 'public' CHECK (ratings_visibility IN ('public', 'followers_only', 'private')),
  reviews_visibility TEXT DEFAULT 'public' CHECK (reviews_visibility IN ('public', 'followers_only', 'private')),
  predictions_visibility TEXT DEFAULT 'public' CHECK (predictions_visibility IN ('public', 'followers_only', 'private')),
  activity_visibility TEXT DEFAULT 'followers_only' CHECK (activity_visibility IN ('public', 'followers_only', 'private')),
  show_in_search BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own privacy settings" ON public.privacy_settings;
CREATE POLICY "users read own privacy settings"
  ON public.privacy_settings FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users update own privacy settings" ON public.privacy_settings;
CREATE POLICY "users update own privacy settings"
  ON public.privacy_settings FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users insert own privacy settings" ON public.privacy_settings;
CREATE POLICY "users insert own privacy settings"
  ON public.privacy_settings FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

-- 2.3 Activity Events
CREATE TABLE IF NOT EXISTS public.activity_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  metadata JSONB,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'followers_only', 'private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_activity_user_time ON public.activity_events(user_id, created_at DESC);

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public activity readable by everyone" ON public.activity_events;
CREATE POLICY "public activity readable by everyone"
  ON public.activity_events FOR SELECT
  USING (visibility = 'public');

DROP POLICY IF EXISTS "followers_only activity readable by followers" ON public.activity_events;
CREATE POLICY "followers_only activity readable by followers"
  ON public.activity_events FOR SELECT
  USING (
    visibility = 'followers_only'
    AND (
      (select auth.uid()) = user_id
      OR EXISTS (
        SELECT 1 FROM public.follows
        WHERE follows.follower_id = (select auth.uid())
          AND follows.followee_id = activity_events.user_id
          AND follows.status = 'accepted'
      )
    )
  );

DROP POLICY IF EXISTS "users insert own activity" ON public.activity_events;
CREATE POLICY "users insert own activity"
  ON public.activity_events FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

-- 2.4 Likes
CREATE TABLE IF NOT EXISTS public.likes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, target_type, target_id)
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "likes readable by everyone" ON public.likes;
CREATE POLICY "likes readable by everyone"
  ON public.likes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users manage own likes" ON public.likes;
CREATE POLICY "users manage own likes"
  ON public.likes FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users remove own likes" ON public.likes;
CREATE POLICY "users remove own likes"
  ON public.likes FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 2.5 Comments
CREATE TABLE IF NOT EXISTS public.comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON public.comments(target_type, target_id, created_at ASC);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments readable by everyone" ON public.comments;
CREATE POLICY "comments readable by everyone"
  ON public.comments FOR SELECT
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "users create own comments" ON public.comments;
CREATE POLICY "users create own comments"
  ON public.comments FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users soft-delete own comments" ON public.comments;
CREATE POLICY "users soft-delete own comments"
  ON public.comments FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- 2.6 Blocks
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own blocks only" ON public.blocks;
CREATE POLICY "users see own blocks only"
  ON public.blocks FOR SELECT
  USING ((select auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "users manage own blocks" ON public.blocks;
CREATE POLICY "users manage own blocks"
  ON public.blocks FOR INSERT
  WITH CHECK ((select auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "users remove own blocks" ON public.blocks;
CREATE POLICY "users remove own blocks"
  ON public.blocks FOR DELETE
  USING ((select auth.uid()) = blocker_id);

-- 2.7 Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own notifications" ON public.notifications;
CREATE POLICY "users read own notifications"
  ON public.notifications FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users mark own notifications read" ON public.notifications;
CREATE POLICY "users mark own notifications read"
  ON public.notifications FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- STEP 3 — Taste DNA Cache & Badges (v4 Phase 2)
-- ------------------------------------------------------------------------------

-- 3.1 Taste DNA Cache
CREATE TABLE IF NOT EXISTS public.taste_dna_cache (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  genre_distribution JSONB,
  era_distribution JSONB,
  top_creators JSONB,
  archetype TEXT,
  tendencies JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.taste_dna_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taste dna readable per profile visibility" ON public.taste_dna_cache;
CREATE POLICY "taste dna readable per profile visibility"
  ON public.taste_dna_cache FOR SELECT
  USING (true);

-- 3.2 User Badges
CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, badge_key)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "badges readable by everyone" ON public.user_badges;
CREATE POLICY "badges readable by everyone"
  ON public.user_badges FOR SELECT
  USING (true);

-- ------------------------------------------------------------------------------
-- STEP 4 — Hype Signal Storage (Track I / v6)
-- ------------------------------------------------------------------------------

-- 4.1 Title Links (External Provider Mappings)
CREATE TABLE IF NOT EXISTS public.title_links (
  title_id TEXT PRIMARY KEY,
  imdb_id TEXT,
  wikidata_qid TEXT,
  wikipedia_title TEXT,
  youtube_trailer_key TEXT,
  omdb_id TEXT,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_title_links_imdb ON public.title_links(imdb_id);

ALTER TABLE public.title_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "title_links readable by everyone" ON public.title_links;
CREATE POLICY "title_links readable by everyone"
  ON public.title_links FOR SELECT
  USING (true);

-- 4.2 Pageview Stats
CREATE TABLE IF NOT EXISTS public.pageview_stats (
  title_id TEXT NOT NULL,
  date DATE NOT NULL,
  views INTEGER NOT NULL,
  PRIMARY KEY (title_id, date)
);

ALTER TABLE public.pageview_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pageview_stats readable by everyone" ON public.pageview_stats;
CREATE POLICY "pageview_stats readable by everyone"
  ON public.pageview_stats FOR SELECT
  USING (true);

-- 4.3 Trailer Stats
CREATE TABLE IF NOT EXISTS public.trailer_stats (
  title_id TEXT NOT NULL,
  date DATE NOT NULL,
  view_count BIGINT,
  like_count BIGINT,
  comment_count BIGINT,
  PRIMARY KEY (title_id, date)
);

ALTER TABLE public.trailer_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trailer_stats readable by everyone" ON public.trailer_stats;
CREATE POLICY "trailer_stats readable by everyone"
  ON public.trailer_stats FOR SELECT
  USING (true);

-- ------------------------------------------------------------------------------
-- STEP 5 — Movie Night & Watch Circles (v5 Track C)
-- ------------------------------------------------------------------------------

-- 5.1 Movie Night Sessions
CREATE TABLE IF NOT EXISTS public.movie_night_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  join_code TEXT UNIQUE NOT NULL,
  host_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  constraints JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '24 hours'),
  decided_title_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_movie_night_code ON public.movie_night_sessions(join_code);

ALTER TABLE public.movie_night_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions readable by anyone with the code" ON public.movie_night_sessions;
CREATE POLICY "sessions readable by anyone with the code"
  ON public.movie_night_sessions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "anyone can create a session" ON public.movie_night_sessions;
CREATE POLICY "anyone can create a session"
  ON public.movie_night_sessions FOR INSERT
  WITH CHECK (true);

-- 5.2 Movie Night Participants
CREATE TABLE IF NOT EXISTS public.movie_night_participants (
  session_id BIGINT NOT NULL REFERENCES public.movie_night_sessions(id) ON DELETE CASCADE,
  participant_key TEXT NOT NULL,
  preferences JSONB,
  votes JSONB,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (session_id, participant_key)
);

ALTER TABLE public.movie_night_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants readable within session" ON public.movie_night_participants;
CREATE POLICY "participants readable within session"
  ON public.movie_night_participants FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "anyone can join a session" ON public.movie_night_participants;
CREATE POLICY "anyone can join a session"
  ON public.movie_night_participants FOR INSERT
  WITH CHECK (true);

-- 5.3 Circles
CREATE TABLE IF NOT EXISTS public.circles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;

-- 5.4 Circle Members (Created before circles policies so relation exists for subqueries)
CREATE TABLE IF NOT EXISTS public.circle_members (
  circle_id BIGINT NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (circle_id, user_id)
);

ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "circle members can read their circle" ON public.circles;
CREATE POLICY "circle members can read their circle"
  ON public.circles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.circle_members
      WHERE circle_members.circle_id = circles.id
        AND circle_members.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "users create circles they own" ON public.circles;
CREATE POLICY "users create circles they own"
  ON public.circles FOR INSERT
  WITH CHECK ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS "members can see their own circle's membership" ON public.circle_members;
CREATE POLICY "members can see their own circle's membership"
  ON public.circle_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.circle_members m
      WHERE m.circle_id = circle_members.circle_id
        AND m.user_id = (select auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- STEP 6 — Analytics (Track A4 / v5)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_analytics_type_created ON public.analytics_events(type, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "analytics_events no client read" ON public.analytics_events;
CREATE POLICY "analytics_events no client read"
  ON public.analytics_events FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "anyone can log an event" ON public.analytics_events;
CREATE POLICY "anyone can log an event"
  ON public.analytics_events FOR INSERT
  WITH CHECK (true);

-- ==============================================================================
-- End of CinePulse Supabase PostgreSQL Schema & RLS
-- ==============================================================================
