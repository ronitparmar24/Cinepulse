/**
 * "The new CinePulse is here" announcement email. Table-based with inline styles so it renders
 * the same in Gmail, Apple Mail, Outlook and phone clients; dark brand look with a light-mode-safe
 * fallback colour on every block.
 */

export const WHATS_NEW: Array<{ icon: string; title: string; text: string; path: string }> = [
  { icon: '🍿', title: 'Movie Night rooms', text: 'Swipe Yes, Maybe or No with friends, reveal the winner, then press play together with a synced countdown.', path: '/?view=movie-night' },
  { icon: '🎁', title: 'Your 2026 Wrapped', text: 'Your year in film — titles, hours, top genres and your prediction record — ready to share.', path: '/' },
  { icon: '📸', title: 'Share your reviews', text: 'Turn any review into a poster card for Instagram Stories, WhatsApp and X.', path: '/?view=community' },
  { icon: '🔔', title: 'Release-day reminders', text: 'Tap Remind me on upcoming films and we’ll tell you the day they’re out. Add them to your calendar too.', path: '/?view=calendar' },
  { icon: '📺', title: 'Your streaming services', text: 'Pick Netflix, Prime Video, JioHotstar and more — see what you can watch right now.', path: '/?view=library' },
  { icon: '🎲', title: 'Tonight’s pick', text: 'Tell us how much time you have and your mood; we pick one film from your watchlist.', path: '/?view=library' },
  { icon: '🔥', title: 'Goals & streaks', text: 'Set a yearly goal, keep a weekly streak going, and get milestone cheers.', path: '/' },
  { icon: '📱', title: 'Install the app', text: 'Add CinePulse to your home screen — full screen, fast, no app store.', path: '/' },
];

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function whatsNewSubject(): string {
  return 'The new CinePulse is here 🎬 Movie nights, Wrapped & more';
}

export function renderWhatsNewEmail(o: { name: string; email: string; origin: string; unsubscribeUrl: string }): string {
  const origin = o.origin.replace(/\/$/, '');
  const link = (path: string, content: string) => `${origin}${path}${path.includes('?') ? '&' : '?'}utm_source=email&utm_campaign=whats-new-2026-11${content ? `&utm_content=${content}` : ''}`;
  const first = esc((o.name || '').trim().split(/\s+/)[0] || 'there');
  const rows: string[] = [];
  for (let i = 0; i < WHATS_NEW.length; i += 2) {
    const cell = (f: (typeof WHATS_NEW)[number] | undefined) => !f ? '<td class="col" width="50%" style="width:50%;padding:6px;"></td>' : `
            <td class="col" width="50%" valign="top" style="width:50%;padding:6px;">
              <a href="${esc(link(f.path, encodeURIComponent(f.title.toLowerCase().replace(/[^a-z]+/g, '-'))))}" target="_blank" style="display:block;text-decoration:none;background-color:#141c21;border:1px solid #23312c;border-radius:16px;padding:18px 18px 16px;">
                <div style="font-size:26px;line-height:1;margin-bottom:10px;">${f.icon}</div>
                <div style="font-family:${FONT};font-size:15px;font-weight:800;color:#f4f6f5;margin-bottom:6px;">${esc(f.title)}</div>
                <div style="font-family:${FONT};font-size:13px;line-height:1.55;color:#9db0a8;">${esc(f.text)}</div>
              </a>
            </td>`;
    rows.push(`<tr>${cell(WHATS_NEW[i])}${cell(WHATS_NEW[i + 1])}</tr>`);
  }

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>The new CinePulse is here</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; border-radius: 0 !important; }
      .pad { padding-left: 22px !important; padding-right: 22px !important; }
      .col { display: block !important; width: 100% !important; }
      .hero-title { font-size: 34px !important; line-height: 1.1 !important; }
    }
    a { color: #b3f3d5; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#06090b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Movie Night rooms, your 2026 Wrapped, share cards, release reminders and more — all new on CinePulse.&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#06090b;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#0b1013;border:1px solid #1e2a26;border-radius:28px;overflow:hidden;">
          <!-- Hero -->
          <tr>
            <td class="pad" style="padding:34px 40px 30px;background-color:#0f2a22;background-image:linear-gradient(160deg,#17473a 0%,#0f2a22 45%,#0b1013 100%);">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td valign="middle" style="padding-right:10px;">
                  <svg width="30" height="30" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="display:block;"><rect width="64" height="64" rx="18" fill="#14241d"/><g fill="#b3f3d5" transform="rotate(-12 32 32)"><rect x="15" y="24" width="8" height="24" rx="4"/><rect x="28" y="12" width="8" height="40" rx="4"/><rect x="41" y="18" width="8" height="31" rx="4"/></g></svg>
                </td>
                <td valign="middle" style="font-family:${FONT};font-size:24px;font-weight:800;letter-spacing:-1px;color:#ffffff;">cinepulse<span style="color:#b3f3d5;">.</span></td>
              </tr></table>
              <div style="height:34px;line-height:34px;">&nbsp;</div>
              <div style="display:inline-block;font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:2px;color:#0f2a1d;background-color:#b3f3d5;border-radius:999px;padding:6px 12px;">NEW VERSION · NOVEMBER 2026</div>
              <h1 class="hero-title" style="margin:16px 0 12px;font-family:${FONT};font-size:42px;line-height:1.05;font-weight:800;letter-spacing:-1.5px;color:#ffffff;">Your movie nights<br>just got an upgrade.</h1>
              <p style="margin:0 0 26px;font-family:${FONT};font-size:16px;line-height:1.65;color:#cfe0d9;">Hi ${first}, we’ve been busy. CinePulse now picks films <em>with</em> your friends, wraps up your year, reminds you on release day and turns your reviews into posters worth sharing.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="center" style="border-radius:14px;background-color:#b3f3d5;">
                  <a href="${esc(link('/', 'hero'))}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;font-weight:800;color:#0f2a1d;text-decoration:none;border-radius:14px;">Explore what’s new &rarr;</a>
                </td>
              </tr></table>
            </td>
          </tr>
          <!-- Spotlight -->
          <tr>
            <td class="pad" style="padding:30px 40px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#191410;border:1px solid #4a3a20;border-radius:20px;">
                <tr><td style="padding:22px 22px 20px;">
                  <div style="font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:2px;color:#fbbf24;margin-bottom:8px;">THE BIG ONE</div>
                  <div style="font-family:${FONT};font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;margin-bottom:8px;">Movie Night, together 🍿</div>
                  <div style="font-family:${FONT};font-size:14px;line-height:1.6;color:#d6cdbd;margin-bottom:16px;">Open a room, share the link — no account needed for friends. Everyone swipes the shortlist, CinePulse reveals the winner and where it streams, then counts the whole group down so you all hit play at the same second.</div>
                  <a href="${esc(link('/?view=movie-night', 'movie-night'))}" target="_blank" style="font-family:${FONT};font-size:14px;font-weight:800;color:#fbbf24;text-decoration:none;">Start a movie night &rarr;</a>
                </td></tr>
              </table>
            </td>
          </tr>
          <!-- Feature grid -->
          <tr>
            <td class="pad" style="padding:26px 34px 8px;">
              <div style="padding:0 6px 10px;font-family:${FONT};font-size:12px;font-weight:800;letter-spacing:2px;color:#8fb3a5;">EVERYTHING ELSE THAT’S NEW</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${rows.join('\n')}
              </table>
            </td>
          </tr>
          <!-- Closing CTA -->
          <tr>
            <td class="pad" align="center" style="padding:24px 40px 34px;">
              <p style="margin:0 0 18px;font-family:${FONT};font-size:15px;line-height:1.6;color:#cfe0d9;">Pop in tonight — your watchlist misses you.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td align="center" style="border-radius:14px;border:1px solid #2f4a40;background-color:#121a1e;">
                  <a href="${esc(link('/', 'footer'))}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:14px;font-weight:800;color:#b3f3d5;text-decoration:none;">Open CinePulse</a>
                </td>
              </tr></table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td class="pad" style="padding:22px 40px 30px;border-top:1px solid #1e2a26;font-family:${FONT};font-size:11.5px;line-height:1.7;color:#6f7d78;text-align:center;">
              <div style="margin-bottom:6px;"><span style="font-weight:800;color:#9db0a8;">cinepulse<span style="color:#b3f3d5;">.</span></span> · For the love of what’s next.</div>
              You’re getting this because you have a CinePulse account (${esc(o.email)}).<br>
              Don’t want product news? <a href="${esc(o.unsubscribeUrl)}" target="_blank" style="color:#9db0a8;text-decoration:underline;">Unsubscribe in one click</a> — account emails like sign-in codes still arrive.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderWhatsNewText(o: { name: string; origin: string; unsubscribeUrl: string }): string {
  const first = (o.name || '').trim().split(/\s+/)[0] || 'there';
  return [
    `Hi ${first},`,
    '',
    'The new CinePulse is here. What’s new:',
    ...WHATS_NEW.map((f) => `• ${f.title} — ${f.text}`),
    '',
    `Explore it: ${o.origin.replace(/\/$/, '')}/?utm_source=email&utm_campaign=whats-new-2026-11`,
    '',
    `Unsubscribe from product news: ${o.unsubscribeUrl}`,
  ].join('\n');
}
