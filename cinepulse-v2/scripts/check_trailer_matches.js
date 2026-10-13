const { DatabaseSync } = require('node:sqlite');
const d = new DatabaseSync('./data/cinepulse.db');
const stats = d.prepare("SELECT DISTINCT title_id, youtube_video_id FROM trailer_stats WHERE title_id NOT LIKE 'yt_test_%'").all();
console.log('Unique titles in trailer_stats:', stats);

for (const s of stats) {
  const lib = d.prepare("SELECT title_json FROM library WHERE title_id = ?").get(s.title_id);
  const rev = d.prepare("SELECT title_name FROM reviews WHERE title_id = ?").get(s.title_id);
  const fore = d.prepare("SELECT title_json FROM forecasts WHERE title_id = ?").get(s.title_id);
  const link = d.prepare("SELECT * FROM title_links WHERE title_id = ?").get(s.title_id);
  console.log(s.title_id, { lib: !!lib, rev: !!rev, fore: !!fore, link: !!link });
}
