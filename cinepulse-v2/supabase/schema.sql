-- ==============================================================================
-- CinePulse Supabase PostgreSQL Schema
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ==============================================================================

-- 1. Profiles Table (Linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone."
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile."
  ON public.profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update their own profile."
  ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = id);

-- Trigger to automatically create a profile when a new user signs up via Supabase Auth (Email or Google)
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

-- 2. Library Table (Watchlist, Watching, Watched)
CREATE TABLE IF NOT EXISTS public.library (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL,
  title_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('watchlist', 'watching', 'watched')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (user_id, title_id)
);

CREATE INDEX IF NOT EXISTS library_user_updated_idx ON public.library(user_id, updated_at DESC);

ALTER TABLE public.library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own library entries."
  ON public.library FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert into their own library."
  ON public.library FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own library entries."
  ON public.library FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own library entries."
  ON public.library FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 3. Community Reviews Table
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

CREATE INDEX IF NOT EXISTS reviews_title_idx ON public.reviews(title_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_created_idx ON public.reviews(created_at DESC);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are viewable by everyone."
  ON public.reviews FOR SELECT
  USING (true);

CREATE POLICY "Users can create reviews."
  ON public.reviews FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own reviews."
  ON public.reviews FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own reviews."
  ON public.reviews FOR DELETE
  USING ((select auth.uid()) = user_id);

-- 4. Forecasts Table (Current User's Call on a Title)
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

CREATE INDEX IF NOT EXISTS forecasts_title_idx ON public.forecasts(title_id);

ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Forecasts are viewable by everyone."
  ON public.forecasts FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own forecasts."
  ON public.forecasts FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own forecasts."
  ON public.forecasts FOR UPDATE
  USING ((select auth.uid()) = user_id);

-- 5. Forecast Events Table (Append-Only Event Log)
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

CREATE INDEX IF NOT EXISTS forecast_events_title_created_idx ON public.forecast_events(title_id, created_at ASC);

ALTER TABLE public.forecast_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Forecast events are viewable by everyone."
  ON public.forecast_events FOR SELECT
  USING (true);

CREATE POLICY "Users can insert forecast events."
  ON public.forecast_events FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

-- 6. API Cache Table
CREATE TABLE IF NOT EXISTS public.api_cache (
  cache_key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS api_cache_expires_idx ON public.api_cache(expires_at);

ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cache is readable by service role and public."
  ON public.api_cache FOR SELECT
  USING (true);
