# CinePulse — Missing Tables & RLS Fix (Supabase/Postgres)

You have 6 tables: `api_cache`, `forecast_events`, `forecasts`, `library`,
`profiles`, `reviews`. RLS is **disabled on all of them** — fix that first,
it's more urgent than adding new tables. Then add what's below, grouped by
which v4/v5/v6 feature actually needs it, in priority order.

> **Important:** all schema in the earlier v3–v6 prompts was written in
> SQLite syntax (`INTEGER PRIMARY KEY`, bare `TIMESTAMP`). You're actually on
> Supabase/Postgres. Use `bigint generated always as identity` or `uuid`,
> `timestamptz`, and `auth.uid()` for RLS — not what those docs literally said.

---

## STEP 0 — Enable RLS on what already exists (do this before anything else)

```sql
alter table profiles enable row level security;
alter table library enable row level security;
alter table reviews enable row level security;
alter table forecasts enable row level security;
alter table forecast_events enable row level security;
alter table api_cache enable row level security;

-- profiles: public read, owner-only write
create policy "profiles readable by everyone" on profiles
  for select using (true);
create policy "users update own profile" on profiles
  for update using (auth.uid() = id);

-- library: public read (you can tighten this later per-list),
-- owner-only write — this is the one that matters most right now
create policy "library readable by everyone" on library
  for select using (true);
create policy "users manage own library" on library
  for insert with check (auth.uid() = user_id);
create policy "users update own library rows" on library
  for update using (auth.uid() = user_id);
create policy "users delete own library rows" on library
  for delete using (auth.uid() = user_id);

-- reviews: public read, owner-only write
create policy "reviews readable by everyone" on reviews
  for select using (true);
create policy "users manage own reviews" on reviews
  for insert with check (auth.uid() = user_id);
create policy "users update own reviews" on reviews
  for update using (auth.uid() = user_id);
create policy "users delete own reviews" on reviews
  for delete using (auth.uid() = user_id);

-- forecasts / forecast_events: readable by everyone (it's the product's
-- whole point to be transparent), writes restricted to owner + server
create policy "forecasts readable by everyone" on forecasts
  for select using (true);
create policy "users create own forecast calls" on forecasts
  for insert with check (auth.uid() = user_id);
-- do NOT add an update policy for forecasts if these are meant to be
-- immutable once locked (per the anti-gaming rule from the community-loop
-- spec) — no update policy at all means no one, including the owner, can
-- edit a submitted call through the client. Edits only happen server-side
-- with the service role key, for resolution.

create policy "forecast_events readable by everyone" on forecast_events
  for select using (true);
-- writes to forecast_events should be server-side only (service role),
-- so intentionally no insert/update policy for authenticated users here.

-- api_cache: no client access at all — server/service-role only
create policy "api_cache no client access" on api_cache
  for select using (false);
```

Check your current column names against `auth.uid()` compatibility — if
`library.user_id` / `reviews.user_id` / `forecasts.user_id` reference
`auth.users.id` as a `uuid` foreign key, the above works as-is. If `profiles.id`
isn't the same UUID as `auth.users.id`, fix that link first — everything else
depends on it.

---

## STEP 1 — Community scoring & prediction trust (Track F / v4 Phase 3)

Your `forecasts` + `forecast_events` tables may already partially cover
this — check their actual columns before creating `predictions_log` fresh;
if `forecast_events` already stores a frozen snapshot at prediction time,
you may just need to add columns rather than a new table.

```sql
create table predictions_log (
  id bigint generated always as identity primary key,
  title_id bigint not null,
  predicted_at timestamptz not null default now(),
  model_version text not null,           -- e.g. 'v1-heuristic', 'v2-gbm'
  probability_hit numeric,               -- calibrated P(revenue >= 2.5x budget)
  revenue_p10 numeric,
  revenue_p50 numeric,
  revenue_p90 numeric,
  factors jsonb,                          -- frozen waterfall contributions
  resolved_at timestamptz,
  actual_revenue numeric,
  was_hit boolean
);
alter table predictions_log enable row level security;
create policy "predictions_log readable by everyone" on predictions_log
  for select using (true);
-- no insert/update policy for authenticated users — this table is written
-- exclusively by server-side jobs using the service role key.

create table user_call_scores (
  user_id uuid not null references auth.users(id),
  title_id bigint not null,
  called_probability numeric not null,
  resolved_at timestamptz,
  actual_outcome boolean,
  brier_score numeric,
  primary key (user_id, title_id)
);
alter table user_call_scores enable row level security;
create policy "call scores readable by everyone" on user_call_scores
  for select using (true);
```

---

## STEP 2 — Social layer (from the social-profiles prompt)

```sql
create table follows (
  follower_id uuid not null references auth.users(id),
  followee_id uuid not null references auth.users(id),
  status text not null default 'accepted',
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id != followee_id)
);
alter table follows enable row level security;
create policy "follows readable by everyone" on follows
  for select using (true);
create policy "users manage own follow rows" on follows
  for insert with check (auth.uid() = follower_id);
create policy "users delete own follow rows" on follows
  for delete using (auth.uid() = follower_id);

create table privacy_settings (
  user_id uuid primary key references auth.users(id),
  watchlist_visibility text default 'public',
  diary_visibility text default 'public',
  ratings_visibility text default 'public',
  reviews_visibility text default 'public',
  predictions_visibility text default 'public',
  activity_visibility text default 'followers_only',
  show_in_search boolean default true
);
alter table privacy_settings enable row level security;
create policy "users read own privacy settings" on privacy_settings
  for select using (auth.uid() = user_id);
create policy "users update own privacy settings" on privacy_settings
  for update using (auth.uid() = user_id);
create policy "users insert own privacy settings" on privacy_settings
  for insert with check (auth.uid() = user_id);
-- note: this table is intentionally NOT publicly readable — your app's
-- resolveVisibility() logic should run server-side (e.g. in a route handler
-- with the service role key) rather than relying on the client to enforce
-- visibility by querying this table directly.

create table activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  type text not null,
  target_type text not null,
  target_id bigint not null,
  metadata jsonb,
  visibility text not null,
  created_at timestamptz not null default now()
);
create index idx_activity_user_time on activity_events(user_id, created_at desc);
alter table activity_events enable row level security;
create policy "public activity readable by everyone" on activity_events
  for select using (visibility = 'public');
create policy "followers_only activity readable by followers" on activity_events
  for select using (
    visibility = 'followers_only'
    and exists (
      select 1 from follows
      where follows.follower_id = auth.uid()
        and follows.followee_id = activity_events.user_id
        and follows.status = 'accepted'
    )
  );
create policy "users insert own activity" on activity_events
  for insert with check (auth.uid() = user_id);

create table likes (
  user_id uuid not null references auth.users(id),
  target_type text not null,
  target_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);
alter table likes enable row level security;
create policy "likes readable by everyone" on likes for select using (true);
create policy "users manage own likes" on likes
  for insert with check (auth.uid() = user_id);
create policy "users remove own likes" on likes
  for delete using (auth.uid() = user_id);

create table comments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  target_type text not null,
  target_id bigint not null,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table comments enable row level security;
create policy "comments readable by everyone" on comments
  for select using (deleted_at is null);
create policy "users create own comments" on comments
  for insert with check (auth.uid() = user_id);
create policy "users soft-delete own comments" on comments
  for update using (auth.uid() = user_id);

create table blocks (
  blocker_id uuid not null references auth.users(id),
  blocked_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
alter table blocks enable row level security;
create policy "users see own blocks only" on blocks
  for select using (auth.uid() = blocker_id);
create policy "users manage own blocks" on blocks
  for insert with check (auth.uid() = blocker_id);
create policy "users remove own blocks" on blocks
  for delete using (auth.uid() = blocker_id);

create table notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  actor_id uuid not null references auth.users(id),
  type text not null,
  target_type text,
  target_id bigint,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table notifications enable row level security;
create policy "users read own notifications" on notifications
  for select using (auth.uid() = user_id);
create policy "users mark own notifications read" on notifications
  for update using (auth.uid() = user_id);
```

---

## STEP 3 — Taste DNA cache (v4 Phase 2)

Computing this live on every profile view is wasteful — cache it,
recompute on a debounced trigger.

```sql
create table taste_dna_cache (
  user_id uuid primary key references auth.users(id),
  genre_distribution jsonb,
  era_distribution jsonb,
  top_creators jsonb,
  archetype text,
  tendencies jsonb,
  computed_at timestamptz not null default now()
);
alter table taste_dna_cache enable row level security;
create policy "taste dna readable per profile visibility" on taste_dna_cache
  for select using (true); -- gate actual exposure in your app layer via
                            -- resolveVisibility(), same as activity_events

create table user_badges (
  user_id uuid not null references auth.users(id),
  badge_key text not null,       -- e.g. 'franchise_completionist'
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);
alter table user_badges enable row level security;
create policy "badges readable by everyone" on user_badges
  for select using (true);
```

---

## STEP 4 — Hype signal storage (Track I / v6, feeds the model in Track D)

```sql
create table title_links (
  title_id bigint primary key,       -- your internal/TMDB id
  imdb_id text,
  wikidata_qid text,
  wikipedia_title text,
  resolved_at timestamptz not null default now()
);
alter table title_links enable row level security;
create policy "title_links readable by everyone" on title_links
  for select using (true);
-- server/service-role writes only

create table pageview_stats (
  title_id bigint not null,
  date date not null,
  views integer not null,
  primary key (title_id, date)
);
alter table pageview_stats enable row level security;
create policy "pageview_stats readable by everyone" on pageview_stats
  for select using (true);

create table trailer_stats (
  title_id bigint not null,
  date date not null,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  primary key (title_id, date)
);
alter table trailer_stats enable row level security;
create policy "trailer_stats readable by everyone" on trailer_stats
  for select using (true);
```

---

## STEP 5 — Movie Night / Watch Circles (v5 Track C — only add when you actually build these)

```sql
create table movie_night_sessions (
  id bigint generated always as identity primary key,
  join_code text unique not null,
  host_id uuid references auth.users(id), -- nullable: anonymous host allowed
  constraints jsonb not null,              -- runtime cap, services, mood, etc.
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  decided_title_id bigint
);
alter table movie_night_sessions enable row level security;
create policy "sessions readable by anyone with the code" on movie_night_sessions
  for select using (true); -- app layer requires knowing join_code to query
create policy "anyone can create a session" on movie_night_sessions
  for insert with check (true);

create table movie_night_participants (
  session_id bigint not null references movie_night_sessions(id),
  participant_key text not null,   -- random client-generated id, anon-friendly
  preferences jsonb,
  votes jsonb,
  joined_at timestamptz not null default now(),
  primary key (session_id, participant_key)
);
alter table movie_night_participants enable row level security;
create policy "participants readable within session" on movie_night_participants
  for select using (true);
create policy "anyone can join a session" on movie_night_participants
  for insert with check (true);

create table circles (
  id bigint generated always as identity primary key,
  name text not null,
  owner_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table circles enable row level security;
create policy "circle members can read their circle" on circles
  for select using (
    exists (select 1 from circle_members
            where circle_members.circle_id = circles.id
              and circle_members.user_id = auth.uid())
  );
create policy "users create circles they own" on circles
  for insert with check (auth.uid() = owner_id);

create table circle_members (
  circle_id bigint not null references circles(id),
  user_id uuid not null references auth.users(id),
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
alter table circle_members enable row level security;
create policy "members can see their own circle's membership" on circle_members
  for select using (
    exists (select 1 from circle_members m
            where m.circle_id = circle_members.circle_id
              and m.user_id = auth.uid())
  );
```

---

## STEP 6 — Analytics (Track A4 / v5)

```sql
create table analytics_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id), -- nullable, anon events allowed
  type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table analytics_events enable row level security;
create policy "analytics_events no client read" on analytics_events
  for select using (false); -- write-only from the client, service-role reads
create policy "anyone can log an event" on analytics_events
  for insert with check (true);
```

---

## PRIORITY IF YOU'RE DOING THIS INCREMENTALLY

1. **Step 0 — RLS on existing tables.** Non-negotiable, do it today regardless
   of anything else in this doc.
2. **Step 1 — `predictions_log`.** Every accuracy/trust feature already
   built in v4 depends on this existing and being written to honestly.
3. **Step 2 — social tables.** Only if the social-profiles prompt's routes
   are live and currently have nowhere to write to.
4. Steps 3–6 as their corresponding features actually get built — don't
   create tables speculatively for features you haven't started, since an
   empty table with a wrong shape is worse than not having one yet.

## ONE THING TO VERIFY BEFORE RUNNING ANY OF THIS

Check whether `library`, `reviews`, `forecasts`, and `forecast_events`
already have a `user_id` (or equivalent) column typed as `uuid` referencing
`auth.users(id)`. If any of them use a custom `profiles.id` that isn't the
same UUID space as `auth.users.id`, the `auth.uid() = user_id` checks above
will silently match nothing — test one policy manually (try reading your own
row as yourself, then as a different logged-in test user) before trusting
that RLS is actually working.
