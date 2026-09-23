# Cinepulse Social Features — Antigravity Prompt

## Vision: From Portfolio to Community

Transform Cinepulse from a personal movie tracking app into a vibrant social platform where cinephiles discover, share, and connect through their love of film. Think Letterboxd's thoughtful film criticism meets Instagram's visual storytelling meets Pinterest's discovery engine.

---

## Core Philosophy

**"Your taste tells your story."**

Every user's profile becomes a curated gallery of their cinematic journey. Lists become shareable mood boards. Reviews become conversation starters. The community explores not just what people watch, but *how* they watch — their patterns, their blind spots, their evolving taste.

---

## 🎯 Primary Features

### 1. **User Profiles — Your Cinematic Identity**

**Letterboxd Inspiration:** Profile as a living archive of film history
**Instagram Inspiration:** Visual identity through grids and highlights
**Pinterest Inspiration:** Personality through curated boards

#### Profile Components

```
┌─────────────────────────────────────────┐
│ @username                    [Follow]   │
│ ────────────────────────────────────    │
│ [Avatar]  Sofia Chen                    │
│           "Arthouse > Blockbusters"     │
│                                         │
│ 📊 Stats Bar:                           │
│ 1,247 films • 89 lists • 456 followers │
│                                         │
│ ┌──────┬──────┬──────┬──────┐          │
│ │ GRID │ LISTS│REVIEWS│STATS │          │
│ └──────┴──────┴──────┴──────┘          │
│                                         │
│ [Film poster grid - 3×N layout]        │
│ ┌───┬───┬───┐                          │
│ │🎬 │🎬 │🎬 │  Recent watches           │
│ ├───┼───┼───┤                          │
│ │🎬 │🎬 │🎬 │  Rated films              │
│ └───┴───┴───┘                          │
└─────────────────────────────────────────┘
```

**Data Structure:**

```python
class UserProfile(BaseModel):
    user_id: str
    username: str  # unique, 3-20 chars, alphanumeric + underscore
    display_name: str
    bio: str | None = None  # max 200 chars
    avatar_url: str | None = None
    banner_url: str | None = None  # cover photo
    location: str | None = None
    website: str | None = None
    favorite_genres: list[str] = []
    favorite_films: list[str] = []  # top 4 films, displayed prominently
    
    # Privacy settings
    is_private: bool = False  # private profiles require follow approval
    show_stats: bool = True
    show_activity: bool = True
    
    # Stats (computed)
    films_watched: int = 0
    reviews_count: int = 0
    lists_count: int = 0
    followers_count: int = 0
    following_count: int = 0
    
    created_at: datetime
    last_active: datetime
```

**Profile Features:**
- ✅ **Customizable Grid View** — Choose between: Recent Activity, Top Rated, Favorites, or Custom Order
- ✅ **Bio with Emojis** — Express personality in 200 characters
- ✅ **Pinned Lists** — Feature up to 3 lists at the top of your profile
- ✅ **Year in Review** — Auto-generated annual stats (like Spotify Wrapped)
- ✅ **Taste Tags** — System-generated tags based on viewing patterns ("70s Enthusiast", "Horror Devotee")

---

### 2. **Social Graph — Follow & Discovery**

**The Three-Tier Connection Model:**

```
┌────────────────────────────────────────────┐
│ Follow Model (asymmetric, like Twitter)   │
├────────────────────────────────────────────┤
│                                            │
│  YOU → FOLLOW → Other User                 │
│                                            │
│  ✓ See their public activity in your feed │
│  ✓ They appear in your Following list     │
│  ✗ No mutual relationship required        │
│                                            │
│  Private Accounts:                         │
│  → Request to Follow (pending approval)   │
│  → They can accept/reject                 │
└────────────────────────────────────────────┘
```

**Data Structure:**

```python
class Follow(BaseModel):
    id: str
    follower_id: str  # person doing the following
    following_id: str  # person being followed
    status: Literal["active", "pending", "blocked"]
    created_at: datetime
    
    # Indexes for fast queries
    class Meta:
        indexes = [
            ("follower_id", "following_id"),  # unique together
            ("following_id", "status"),  # for follower lists
            ("follower_id", "status"),  # for following lists
        ]

class FollowSuggestion(BaseModel):
    """System-generated suggestions based on taste overlap"""
    user_id: str
    suggested_user_id: str
    reason: str  # "You both love Sci-Fi" | "3 mutual followers"
    score: float  # 0-1, higher = better match
    dismissed: bool = False
```

**Follow Features:**
- ✅ **Follow/Unfollow** — One-click relationship management
- ✅ **Pending Requests** — For private accounts
- ✅ **Mutual Followers** — See who follows you back
- ✅ **Block/Mute** — Privacy controls
- ✅ **Smart Suggestions** — "Users who liked [film] also follow..."
- ✅ **Taste Match Score** — Show % compatibility based on ratings overlap

---

### 3. **Activity Feed — Your Cinematic Timeline**

**Instagram/Letterboxd Hybrid:** Visual cards with rich interactions

```
┌─────────────────────────────────────────────────┐
│ 🏠 Feed      🔍 Explore     🔔 Activity         │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌──────────────────────────────────────────┐   │
│ │ @alex_films · 2h ago               […]  │   │
│ │ ──────────────────────────────────────   │   │
│ │ watched and rated ★★★★½               │   │
│ │                                          │   │
│ │ [Blade Runner 2049 poster - large]      │   │
│ │                                          │   │
│ │ "Villeneuve's masterpiece. Every frame  │   │
│ │  could be a painting. Roger Deakins is  │   │
│ │  a god." [Read more...]                 │   │
│ │                                          │   │
│ │ ❤️ 24  💬 8  🔁 3                       │   │
│ └──────────────────────────────────────────┘   │
│                                                 │
│ ┌──────────────────────────────────────────┐   │
│ │ @maria_watches · 5h ago            […]  │   │
│ │ ──────────────────────────────────────   │   │
│ │ created a new list: "Cozy Rainy Day"    │   │
│ │                                          │   │
│ │ [4 film posters in a row]               │   │
│ │                                          │   │
│ │ 12 films                                │   │
│ │ ❤️ 156  💬 23  🔖 89                    │   │
│ └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Activity Types:**

```python
class ActivityType(str, Enum):
    WATCHED = "watched"  # logged a film
    RATED = "rated"  # gave a rating
    REVIEWED = "reviewed"  # wrote a review
    LISTED = "listed"  # created/updated a list
    LIKED = "liked"  # liked content
    COMMENTED = "commented"  # commented on something
    FOLLOWED = "followed"  # followed a user

class Activity(BaseModel):
    id: str
    user_id: str
    activity_type: ActivityType
    timestamp: datetime
    
    # Polymorphic content
    film_id: str | None = None
    rating: float | None = None  # 0.5 to 5.0 (half-star increments)
    review_text: str | None = None
    list_id: str | None = None
    target_user_id: str | None = None  # for follows
    
    # Engagement
    likes_count: int = 0
    comments_count: int = 0
    shares_count: int = 0
    
    # Privacy
    visibility: Literal["public", "followers", "private"] = "public"
```

**Feed Algorithm:**

```python
def generate_feed(user_id: str, limit: int = 20) -> list[Activity]:
    """
    Feed composition (Letterboxd-inspired chronological + relevance):
    
    1. Following Activity (70%)
       - Recent watches, reviews, lists from followed users
       - Chronological within last 7 days
    
    2. Popular This Week (20%)
       - Trending reviews from broader community
       - Weighted by engagement + recency
    
    3. Personalized Picks (10%)
       - Reviews of films on user's watchlist
       - Activity from users with similar taste
    
    Sort: Reverse chronological with slight engagement boost
    """
    pass
```

**Feed Features:**
- ✅ **Like/Unlike** — Heart button, double-tap on mobile
- ✅ **Comment Threads** — Nested conversations
- ✅ **Share/Repost** — Boost content to your followers
- ✅ **Bookmark** — Save for later (private)
- ✅ **Filters** — Toggle activity types on/off
- ✅ **Real-time Updates** — New activity badge counter

---

### 4. **Explore & Discovery — The Pinterest Experience**

**Visual, Serendipitous, Algorithm-Driven**

```
┌─────────────────────────────────────────────────┐
│ 🔍 Explore                                      │
├─────────────────────────────────────────────────┤
│ [For You] [Trending] [Lists] [Reviews] [People]│
├─────────────────────────────────────────────────┤
│                                                 │
│ Masonry Grid Layout (Pinterest-style):         │
│                                                 │
│ ┌──────┐  ┌──────┐  ┌──────┐                  │
│ │ 🎬   │  │ 📝   │  │ 👤   │                  │
│ │Film  │  │Review│  │User  │                  │
│ │Card  │  │★★★★ │  │@alex │                  │
│ └──────┘  │Long  │  └──────┘                  │
│           │text  │  ┌──────┐                  │
│ ┌──────┐  │...   │  │ 📋   │                  │
│ │ 🎬   │  └──────┘  │List: │                  │
│ │Film  │            │"Neo- │                  │
│ └──────┘  ┌──────┐  │Noir" │                  │
│           │ 🎬   │  │[imgs]│                  │
│           │Film  │  └──────┘                  │
│           └──────┘                             │
└─────────────────────────────────────────────────┘
```

**Explore Sections:**

1. **For You (Personalized)**
   ```python
   def generate_for_you(user_id: str) -> list[dict]:
       """
       Recommendations based on:
       - Viewing history + ratings
       - Followed users' activity
       - Genre preferences
       - Collaborative filtering (users with similar taste)
       """
       return [
           {"type": "film", "reason": "Because you liked Inception"},
           {"type": "review", "reason": "From users you might enjoy"},
           {"type": "list", "reason": "Popular in Sci-Fi"},
           {"type": "user", "reason": "85% taste match"},
       ]
   ```

2. **Trending This Week**
   - Most-watched films (last 7 days)
   - Viral reviews (high engagement velocity)
   - Hottest lists (bookmark rate)
   - Rising users (follower growth)

3. **Curated Collections**
   - "Staff Picks: Hidden Gems"
   - "Trending on Letterboxd Right Now"
   - "Most Controversial Reviews"
   - "Lists That Went Viral"

**Data Structure:**

```python
class ExploreItem(BaseModel):
    id: str
    item_type: Literal["film", "review", "list", "user"]
    item_id: str
    title: str
    subtitle: str | None = None
    image_url: str
    
    # Metadata
    engagement_score: float  # combined metric
    trending_score: float | None = None
    relevance_score: float | None = None  # personalized
    
    # Context
    reason_shown: str  # "Trending" | "For You" | "Similar to..."
    
class TrendingFilm(BaseModel):
    film_id: str
    watches_last_7d: int
    avg_rating_last_7d: float
    velocity: float  # rate of growth
    trending_rank: int
```

---

### 5. **Lists — The Pinterest Board Equivalent**

**Curated, Shareable, Collaborative Film Collections**

```
┌─────────────────────────────────────────────────┐
│ 📋 Films That Feel Like a Warm Hug             │
│ By @cozycinema · Updated 2 days ago            │
├─────────────────────────────────────────────────┤
│ "For when you need comfort"                    │
│                                                 │
│ 🔓 Public • 🔖 Bookmarked by 892 people        │
│ ❤️ 1.2K  💬 45  🔗 Share                       │
├─────────────────────────────────────────────────┤
│                                                 │
│ [Film posters in grid - hover for details]     │
│ ┌─────┬─────┬─────┬─────┐                     │
│ │  1  │  2  │  3  │  4  │                     │
│ │ 🎬  │ 🎬  │ 🎬  │ 🎬  │                     │
│ ├─────┼─────┼─────┼─────┤                     │
│ │  5  │  6  │  7  │  8  │                     │
│ │ 🎬  │ 🎬  │ 🎬  │ 🎬  │                     │
│ └─────┴─────┴─────┴─────┘                     │
│                                                 │
│ [+ Add films] [Edit] [Delete]                  │
└─────────────────────────────────────────────────┘
```

**List Features:**

```python
class List(BaseModel):
    id: str
    user_id: str
    title: str  # max 100 chars
    description: str | None = None  # max 500 chars
    
    # Films
    film_ids: list[str] = []  # ordered
    film_count: int = 0
    
    # Metadata
    is_ranked: bool = False  # numbered 1-N vs unranked
    is_collaborative: bool = False  # others can suggest additions
    tags: list[str] = []  # "horror", "90s", "feel-good"
    
    # Privacy
    visibility: Literal["public", "unlisted", "private"] = "public"
    
    # Engagement
    likes_count: int = 0
    bookmarks_count: int = 0  # users who saved it
    comments_count: int = 0
    views_count: int = 0
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
class ListBookmark(BaseModel):
    """User saved someone else's list"""
    user_id: str
    list_id: str
    created_at: datetime
```

**List Types:**
- ✅ **Personal Lists** — "My Watchlist", "Films I Own"
- ✅ **Curated Collections** — "Best of 2024", "Desert Island Top 10"
- ✅ **Mood Boards** — "Rainy Day Watches", "Post-Breakup Healing"
- ✅ **Collaborative Lists** — Friends can suggest additions
- ✅ **Ranked vs Unranked** — Ordered preferences or loose collections

---

### 6. **Reviews & Comments — The Conversation Layer**

**Letterboxd's Thoughtful Criticism Meets Instagram's Quick Reactions**

```python
class Review(BaseModel):
    id: str
    user_id: str
    film_id: str
    
    # Content
    rating: float | None = None  # 0.5 to 5.0
    text: str | None = None  # max 10,000 chars
    contains_spoilers: bool = False
    
    # Context
    watched_date: date | None = None
    rewatch: bool = False
    rewatch_count: int = 0
    
    # Engagement
    likes_count: int = 0
    comments_count: int = 0
    helpful_count: int = 0  # "This review was helpful" button
    
    # Visibility
    visibility: Literal["public", "followers", "private"] = "public"
    
    created_at: datetime
    updated_at: datetime

class Comment(BaseModel):
    id: str
    user_id: str
    
    # Polymorphic: can comment on reviews, lists, or other comments
    parent_type: Literal["review", "list", "comment"]
    parent_id: str
    
    text: str  # max 2,000 chars
    
    # Engagement
    likes_count: int = 0
    replies_count: int = 0  # if parent_type = "comment"
    
    created_at: datetime
    updated_at: datetime
```

**Review Features:**
- ✅ **Star Ratings** — Half-star increments (0.5 to 5.0)
- ✅ **Text Reviews** — Rich text with markdown support
- ✅ **Spoiler Tags** — Click to reveal
- ✅ **Rewatch Indicator** — "Watched for the 3rd time"
- ✅ **Sorting** — Popular, Recent, Friends, Highest Rated, Most Debated
- ✅ **Like & Reply** — Nested comment threads
- ✅ **Report/Moderation** — Flag inappropriate content

---

### 7. **Notifications — Stay Connected**

**Real-time Engagement Updates**

```python
class Notification(BaseModel):
    id: str
    user_id: str  # recipient
    
    # Actor
    actor_id: str | None = None  # who triggered it
    actor_username: str | None = None
    actor_avatar: str | None = None
    
    # Type & Content
    type: Literal[
        "follow",           # X followed you
        "follow_request",   # X wants to follow you
        "like_review",      # X liked your review
        "like_list",        # X liked your list
        "comment_review",   # X commented on your review
        "comment_list",     # X commented on your list
        "reply",            # X replied to your comment
        "list_film",        # X added your film to their list
        "mention",          # X mentioned you (@username)
        "milestone",        # You've watched 100 films!
    ]
    
    # References
    film_id: str | None = None
    review_id: str | None = None
    list_id: str | None = None
    comment_id: str | None = None
    
    # State
    is_read: bool = False
    
    created_at: datetime

class NotificationPreferences(BaseModel):
    user_id: str
    
    # Email notifications
    email_follows: bool = True
    email_comments: bool = True
    email_weekly_digest: bool = True
    
    # Push notifications
    push_follows: bool = True
    push_comments: bool = True
    push_likes: bool = False  # usually too noisy
    
    # In-app
    show_milestones: bool = True
```

**Notification Features:**
- ✅ **Real-time Badge Counter** — Unread count
- ✅ **Grouped Notifications** — "5 people liked your review"
- ✅ **Mark All Read**
- ✅ **Email Digests** — Daily or weekly summaries
- ✅ **Push Notifications** — Mobile alerts
- ✅ **Customizable Preferences** — Granular control

---

### 8. **Search & Filtering — Find Anything**

```python
class SearchQuery(BaseModel):
    query: str
    filters: SearchFilters
    sort: Literal["relevance", "popular", "recent"]
    limit: int = 20
    offset: int = 0

class SearchFilters(BaseModel):
    # What to search
    search_films: bool = True
    search_users: bool = True
    search_reviews: bool = True
    search_lists: bool = True
    
    # Film filters
    genres: list[str] = []
    year_min: int | None = None
    year_max: int | None = None
    rating_min: float | None = None
    
    # User filters
    min_followers: int | None = None
    
    # Content filters
    has_review_text: bool | None = None
    has_spoilers: bool | None = None

class SearchResult(BaseModel):
    results: list[dict]  # polymorphic
    total: int
    facets: dict  # for filter counts
```

**Search Features:**
- ✅ **Global Search** — Films, users, reviews, lists
- ✅ **Autocomplete** — Type-ahead suggestions
- ✅ **Filters** — Genre, year, rating, etc.
- ✅ **Saved Searches** — Quick access to common queries
- ✅ **Recent Searches** — Search history

---

## 🎨 UI/UX Guidelines

### Design Principles

1. **Film-First Visuals**
   - Posters are the hero — large, high-quality, with subtle shadows
   - Dark mode default (cinema aesthetic)
   - Generous whitespace around content

2. **Effortless Interactions**
   - Double-tap to like (Instagram muscle memory)
   - Swipe to navigate (mobile-first thinking)
   - Hover reveals details (desktop delight)

3. **Speed Matters**
   - Optimistic UI updates (instant feedback)
   - Infinite scroll with pagination fallback
   - Image lazy loading with blurhash placeholders

4. **Respectful Social**
   - No algorithmic manipulation
   - Chronological feeds by default
   - Easy privacy controls
   - No ads (monetize via premium features)

### Color Palette

```css
:root {
  /* Dark cinema theme */
  --bg-primary: #0f0f1a;      /* Deep navy, almost black */
  --bg-secondary: #1a1a2e;     /* Lighter navy */
  --bg-tertiary: #25253a;      /* Card backgrounds */
  
  /* Accents */
  --accent-primary: #ff6b6b;   /* Coral red (like/heart) */
  --accent-secondary: #4ecdc4; /* Teal (highlights) */
  --accent-gold: #ffd93d;      /* Gold (stars/ratings) */
  
  /* Text */
  --text-primary: #f8f9fa;     /* Near white */
  --text-secondary: #adb5bd;   /* Gray */
  --text-tertiary: #6c757d;    /* Dim gray */
  
  /* Semantic */
  --success: #51cf66;
  --warning: #ffa94d;
  --error: #ff6b6b;
}
```

### Typography

```css
/* System fonts for speed */
--font-display: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-body: "Inter", -apple-system, sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", Consolas, monospace;
```

### Responsive Breakpoints

```css
/* Mobile-first */
--breakpoint-sm: 640px;   /* Phones */
--breakpoint-md: 768px;   /* Tablets */
--breakpoint-lg: 1024px;  /* Laptop */
--breakpoint-xl: 1280px;  /* Desktop */
```

---

## 🔧 Technical Architecture

### Backend Stack Recommendations

```python
# FastAPI (already using) + additions
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorClient  # MongoDB for scale
from redis import asyncio as aioredis  # Caching + real-time
from elasticsearch import AsyncElasticsearch  # Search

# Key additions to existing backend:

# 1. Real-time with WebSockets
@app.websocket("/ws/feed")
async def websocket_feed(websocket: WebSocket, user_id: str):
    """Stream new activity to connected clients"""
    await websocket.accept()
    # Redis pub/sub for real-time updates
    pass

# 2. Caching layer
class CacheService:
    """Redis-backed caching"""
    
    async def get_user_feed(self, user_id: str) -> list[Activity]:
        # Check cache first
        pass
    
    async def invalidate_user_feed(self, user_id: str):
        # On new activity, clear cache
        pass

# 3. Task queue (Celery/RQ/ARQ)
async def generate_notifications(activity_id: str):
    """Background task: create notifications for followers"""
    pass

async def update_trending_scores():
    """Periodic task: recalculate trending content"""
    pass
```

### Database Schema Decisions

**MongoDB for Social Graph & Activity**
- Flexible schema for polymorphic activity types
- Horizontal scaling for growing user base
- Geospatial queries (future: local film screenings)

```javascript
// MongoDB Collections

db.users.createIndex({ username: 1 }, { unique: true })
db.users.createIndex({ "followers_count": -1 })

db.follows.createIndex({ follower_id: 1, following_id: 1 }, { unique: true })
db.follows.createIndex({ following_id: 1, status: 1 })

db.activities.createIndex({ user_id: 1, timestamp: -1 })
db.activities.createIndex({ film_id: 1, timestamp: -1 })
db.activities.createIndex({ timestamp: -1, likes_count: -1 })

db.reviews.createIndex({ film_id: 1, likes_count: -1 })
db.reviews.createIndex({ user_id: 1, created_at: -1 })

db.lists.createIndex({ user_id: 1, visibility: 1 })
db.lists.createIndex({ bookmarks_count: -1, updated_at: -1 })

db.notifications.createIndex({ user_id: 1, is_read: 1, created_at: -1 })
```

**Redis for:**
- Session management
- Feed caching (user's timeline)
- Real-time presence ("3 users watching this now")
- Rate limiting
- Trending calculations (sorted sets)

**Elasticsearch for:**
- Full-text search across reviews
- Autocomplete for usernames
- Faceted search with filters

### API Endpoints (additions to existing)

```python
# Social Graph
POST   /api/users/{username}/follow
DELETE /api/users/{username}/unfollow
GET    /api/users/{username}/followers
GET    /api/users/{username}/following
GET    /api/users/suggestions  # who to follow

# Activity Feed
GET    /api/feed  # personalized timeline
GET    /api/feed/public  # global activity
GET    /api/users/{username}/activity  # user's public activity

# Reviews
POST   /api/films/{film_id}/reviews
GET    /api/films/{film_id}/reviews
PUT    /api/reviews/{review_id}
DELETE /api/reviews/{review_id}
POST   /api/reviews/{review_id}/like
POST   /api/reviews/{review_id}/comments

# Lists
POST   /api/lists
GET    /api/lists/{list_id}
PUT    /api/lists/{list_id}
DELETE /api/lists/{list_id}
POST   /api/lists/{list_id}/films/{film_id}  # add film
DELETE /api/lists/{list_id}/films/{film_id}  # remove film
POST   /api/lists/{list_id}/bookmark

# Explore
GET    /api/explore/for-you
GET    /api/explore/trending
GET    /api/explore/popular-lists

# Notifications
GET    /api/notifications
PUT    /api/notifications/mark-read
POST   /api/notifications/preferences

# Search
GET    /api/search?q={query}&type={films|users|reviews|lists}
```

---

## 📱 Mobile Considerations

### Progressive Web App (PWA)

```javascript
// manifest.json
{
  "name": "Cinepulse",
  "short_name": "Cinepulse",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#ff6b6b",
  "background_color": "#0f0f1a",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Mobile-First Features
- ✅ **Pull to Refresh** — Update feed
- ✅ **Haptic Feedback** — On interactions
- ✅ **Share Sheet Integration** — Native sharing
- ✅ **Offline Support** — Service worker caching
- ✅ **App Badging** — Unread notification count

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Weeks 1-4)
**Goal:** User profiles + basic social graph

- [ ] User profile pages (view-only)
- [ ] Edit profile (bio, avatar, banner)
- [ ] Follow/Unfollow functionality
- [ ] Followers/Following lists
- [ ] Basic user search

**Deliverable:** Users can create profiles and follow each other

---

### Phase 2: Activity & Reviews (Weeks 5-8)
**Goal:** Content creation + personal feeds

- [ ] Review creation (rating + text)
- [ ] Activity logging (watched/rated events)
- [ ] Personal activity feed
- [ ] Like/Unlike reviews
- [ ] Comment on reviews
- [ ] Spoiler tags

**Deliverable:** Users can review films and see friends' activity

---

### Phase 3: Lists & Collections (Weeks 9-11)
**Goal:** Pinterest-style curation

- [ ] Create/edit lists
- [ ] Add/remove films from lists
- [ ] Public/private/unlisted visibility
- [ ] List bookmarking
- [ ] List discovery page
- [ ] Collaborative lists

**Deliverable:** Users can curate and share film collections

---

### Phase 4: Discovery & Explore (Weeks 12-15)
**Goal:** Algorithm-driven content discovery

- [ ] Explore page (For You tab)
- [ ] Trending calculations
- [ ] Follow suggestions (taste matching)
- [ ] Popular lists
- [ ] Staff picks
- [ ] Search improvements (facets, filters)

**Deliverable:** Users discover new films and people via smart recommendations

---

### Phase 5: Notifications & Real-time (Weeks 16-18)
**Goal:** Keep users engaged

- [ ] Notification system
- [ ] Real-time updates (WebSockets)
- [ ] Email digests
- [ ] Push notifications (PWA)
- [ ] Notification preferences
- [ ] Badge counters

**Deliverable:** Users stay informed about social interactions

---

### Phase 6: Polish & Scale (Weeks 19-24)
**Goal:** Production-ready community platform

- [ ] Performance optimization (caching, CDN)
- [ ] Moderation tools (report/block)
- [ ] Analytics dashboard
- [ ] A/B testing framework
- [ ] Mobile app refinements
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Load testing (10K+ concurrent users)

**Deliverable:** Scalable, polished social platform

---

## 🎯 Success Metrics

### Engagement Metrics

```python
class CommunityMetrics(BaseModel):
    """Track platform health"""
    
    # Growth
    daily_active_users: int
    weekly_active_users: int
    monthly_active_users: int
    new_signups: int
    
    # Engagement
    avg_session_duration: float  # minutes
    reviews_per_user: float
    lists_created_per_user: float
    avg_follows_per_user: float
    
    # Content
    total_reviews: int
    total_lists: int
    total_comments: int
    
    # Social
    follow_ratio: float  # following / followers
    engagement_rate: float  # interactions / impressions
    retention_rate: float  # % users active after 30 days
```

### Target Benchmarks (Month 6)

- **10K+ registered users**
- **30% monthly active rate** (3K MAU)
- **50+ reviews/day**
- **5+ lists created/day**
- **200+ social interactions/hour** (likes, comments, follows)
- **<2s average page load time**
- **>90% uptime**

---

## 🔒 Privacy & Safety

### Core Principles

1. **User Control**
   - Private accounts by default option
   - Granular visibility settings
   - Easy block/mute/unfollow

2. **Data Minimization**
   - Only collect what's necessary
   - No tracking across other sites
   - Clear data export option (GDPR)

3. **Content Moderation**
   - Report system for abuse
   - Community guidelines
   - Automated profanity filter (optional)
   - Volunteer moderators for scale

### Safety Features

```python
class SafetySettings(BaseModel):
    user_id: str
    
    # Privacy
    profile_visibility: Literal["public", "followers", "private"]
    activity_visibility: Literal["public", "followers", "private"]
    show_in_search: bool = True
    allow_mentions: Literal["everyone", "followers", "no one"]
    
    # Safety
    blocked_users: list[str] = []
    muted_users: list[str] = []  # hide their content
    blocked_keywords: list[str] = []  # filter reviews/comments
    
    # Content
    hide_spoilers_by_default: bool = True
    filter_mature_content: bool = False
```

---

## 💡 Unique Differentiators

**What makes Cinepulse special?**

### 1. **Mood-Based Discovery**
```
"How are you feeling right now?"
😊 Happy → Light comedies, feel-good films
😢 Sad → Cathartic dramas, comfort watches  
🤔 Thoughtful → Cerebral thrillers, documentaries
🎉 Excited → Action blockbusters, adventures
```

### 2. **Shared Watch Parties (Future)**
- Virtual screenings with friends
- Synchronized playback
- Live chat during films
- Post-watch discussion threads

### 3. **Taste Profiles**
```
Auto-generated tags based on viewing patterns:
- "70s Arthouse Devotee" 
- "Horror Completist"
- "Criterion Channel Regular"
- "Blockbuster Skeptic"
- "Foreign Film Explorer"
```

### 4. **Film Bingo Challenges**
```
"30-Day Film Challenge"
□ Watch a silent film
□ Watch something from 1950s
□ Watch a film from 5 different countries
□ Watch a documentary
□ Rewatch a childhood favorite
```

### 5. **Local Cinema Integration**
- Show nearby screenings
- RSVP to events
- Find people attending same showing
- Support independent theaters

---

## 📚 Inspiration References

### Letterboxd
- ✅ Thoughtful film criticism
- ✅ Rating system (half-stars)
- ✅ Activity feed focused on film
- ✅ Lists as creative expression

### Instagram
- ✅ Visual grid profiles
- ✅ Stories (could be: "Currently Watching")
- ✅ Double-tap to like
- ✅ Clean, minimalist UI

### Pinterest
- ✅ Discovery algorithm
- ✅ Masonry grid layout
- ✅ Saving/bookmarking content
- ✅ Visual browsing experience

### Goodreads (what to avoid)
- ❌ Cluttered UI
- ❌ Slow performance
- ❌ Poor mobile experience
- ❌ Outdated design

---

## 🛠 Development Resources

### Frontend
```javascript
// Recommended stack
- React 18 (or Vue 3) + TypeScript
- TailwindCSS for styling
- Framer Motion for animations
- React Query for data fetching
- Zustand/Jotai for state
- React Router for navigation

// Key libraries
- react-intersection-observer (infinite scroll)
- react-window (virtualized lists)
- react-blurhash (image placeholders)
- emoji-mart (emoji picker)
- react-markdown (review text)
```

### Backend
```python
# Already using FastAPI ✓

# Additions needed:
pip install motor  # Async MongoDB
pip install redis
pip install elasticsearch
pip install celery  # Background tasks
pip install python-multipart  # File uploads
pip install pillow  # Image processing
pip install slowapi  # Rate limiting
```

### Infrastructure
```yaml
# docker-compose.yml additions

services:
  mongodb:
    image: mongo:7
    volumes:
      - mongo_data:/data/db
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
  
  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
  
  celery_worker:
    build: ./backend
    command: celery -A app.tasks worker --loglevel=info
```

---

## 🎬 Closing Thoughts

This specification transforms Cinepulse from a personal portfolio into a **thriving community platform** where film lovers connect through shared taste.

**The north star:** Every interaction should deepen someone's relationship with cinema — whether that's discovering a hidden gem, finding a kindred spirit with similar taste, or having a meaningful conversation about a film that moved them.

**Start small, iterate fast:**
1. Launch with profiles + follows
2. Add reviews + feed
3. Build from user feedback
4. Grow organically through word-of-mouth

**Remember:** Letterboxd took 10 years to reach its current form. Start with the core loop (profile → follow → review → discover) and let the community guide the rest.

---

## 📝 Next Steps

1. **Review this spec** — Add/remove features based on your vision
2. **Prioritize Phase 1** — Get profiles + follows working first
3. **Set up infrastructure** — MongoDB, Redis, task queue
4. **Design UI mockups** — Profile page, feed, film page
5. **Start coding** — Backend API endpoints first, then frontend

**Questions? Adjust priorities? Ready to build?** Let's turn Cinepulse into the film community we all want to be part of. 🎬✨
