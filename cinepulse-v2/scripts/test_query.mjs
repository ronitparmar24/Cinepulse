import { DatabaseSync } from 'node:sqlite';
const d = new DatabaseSync('./data/cinepulse.db');

const rows = d.prepare(`
  WITH recent_stats AS (
    SELECT
      title_id,
      youtube_video_id,
      view_count,
      like_count,
      recorded_at,
      ROW_NUMBER() OVER (PARTITION BY title_id ORDER BY recorded_at DESC) as rn_latest,
      ROW_NUMBER() OVER (PARTITION BY title_id ORDER BY recorded_at ASC) as rn_oldest
    FROM trailer_stats
    WHERE title_id NOT LIKE 'yt_test_%'
  ),
  latest AS (
    SELECT title_id, youtube_video_id, view_count, like_count, recorded_at
    FROM recent_stats WHERE rn_latest = 1
  ),
  oldest AS (
    SELECT title_id, view_count
    FROM recent_stats WHERE rn_oldest = 1
  )
  SELECT
    l.title_id,
    l.youtube_video_id AS video_id,
    l.view_count AS current_views,
    COALESCE(l.view_count - o.view_count, 0) AS views_7d_growth,
    l.like_count,
    l.recorded_at
  FROM latest l
  LEFT JOIN oldest o ON l.title_id = o.title_id
  WHERE l.current_views > 0 OR l.like_count > 0
  ORDER BY views_7d_growth DESC, current_views DESC
  LIMIT 10
`).all();

console.log('Returned rows:', rows.length);
console.log(rows);
