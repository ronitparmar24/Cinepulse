import { randomUUID } from 'node:crypto';
import type { Forecast, Pulse, User } from './types';
import { db, now, transaction } from './db';
import { bad, notFound, unauthorized } from './errors';
import { titleById } from './catalog';
import { isValidDate } from './eligibility';
import { isSupabaseConfigured, supabaseAdmin } from './supabase';

export function wilson(success:number,total:number,z=1.959963984540054):[number,number] | null {
  if (!Number.isInteger(success)||!Number.isInteger(total)||total<1||success<0||success>total) return null;
  const p=success/total, z2=z*z, denominator=1+z2/total, centre=(p+z2/(2*total))/denominator, spread=z*Math.sqrt((p*(1-p)+z2/(4*total))/total)/denominator;
  return [success===0?0:Math.max(0,centre-spread),success===total?1:Math.min(1,centre+spread)];
}

function forecast(row:any): Forecast {
  return {
    titleId: row.title_id,
    choice: row.choice,
    confidence: Number(row.confidence),
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function isForecastOpen(releaseDate:string|null, today=new Date().toISOString().slice(0,10)):boolean {
  return !!releaseDate && isValidDate(releaseDate) && isValidDate(today) && releaseDate > today;
}
const isOpen = isForecastOpen;

export async function getPulse(titleId:string, user?:User|null): Promise<Pulse> {
  const title = await titleById(titleId);

  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { data: forecastRows } = await admin
        .from('forecasts')
        .select('choice')
        .eq('title_id', title.id);

      const hit = forecastRows?.filter(r => r.choice === 'hit').length || 0;
      const flop = forecastRows?.filter(r => r.choice === 'flop').length || 0;
      const count = hit + flop;

      const { data: eventRows } = await admin
        .from('forecast_events')
        .select('created_at, choice')
        .eq('title_id', title.id)
        .eq('first_submission', true)
        .order('created_at', { ascending: true });

      const byDate = new Map<string, {count:number; hit:number}>();
      if (eventRows) {
        for (const e of eventRows) {
          const date = String(e.created_at).slice(0, 10);
          const item = byDate.get(date) || { count: 0, hit: 0 };
          item.count++;
          if (e.choice === 'hit') item.hit++;
          byDate.set(date, item);
        }
      }

      let my: any = null;
      if (user) {
        const { data: myData } = await admin
          .from('forecasts')
          .select('*')
          .eq('user_id', user.id)
          .eq('title_id', title.id)
          .maybeSingle();
        my = myData;
      }

      const target = title.mediaType === 'movie'
        ? 'Your opinion of theatrical commercial success; not a measured profitability outcome.'
        : 'Your expectation of audience reception; not profit or renewal.';
      const open = isOpen(title.releaseDate);

      return {
        count,
        hit,
        flop,
        hitShare: count ? hit / count : null,
        interval: wilson(hit, count),
        stage: count === 0 ? 'no-data' : count < 10 ? 'early' : count < 50 ? 'growing' : 'established',
        history: Array.from(byDate.entries()).map(([date, v]) => ({ date, ...v })),
        myForecast: my ? forecast(my) : null,
        forecastOpen: open,
        target
      };
    }
  }

  const d = db();
  const rows = d.prepare('SELECT choice,COUNT(*) count FROM forecasts WHERE title_id=? GROUP BY choice').all(title.id) as any[];
  const hit = Number(rows.find(x => x.choice === 'hit')?.count || 0);
  const flop = Number(rows.find(x => x.choice === 'flop')?.count || 0);
  const count = hit + flop;
  const events = d.prepare('SELECT user_id,created_at,choice FROM forecast_events WHERE title_id=? AND first_submission=1 ORDER BY created_at ASC').all(title.id) as any[];
  const byDate = new Map<string, {count:number; hit:number}>();
  for (const e of events) {
    const date = String(e.created_at).slice(0, 10);
    const item = byDate.get(date) || { count: 0, hit: 0 };
    item.count++;
    if (e.choice === 'hit') item.hit++;
    byDate.set(date, item);
  }
  const my = user ? d.prepare('SELECT * FROM forecasts WHERE user_id=? AND title_id=?').get(user.id, title.id) as any : undefined;
  const target = title.mediaType === 'movie' ? 'Your opinion of theatrical commercial success; not a measured profitability outcome.' : 'Your expectation of audience reception; not profit or renewal.';
  const open = isOpen(title.releaseDate);

  return {
    count,
    hit,
    flop,
    hitShare: count ? hit / count : null,
    interval: wilson(hit, count),
    stage: count === 0 ? 'no-data' : count < 10 ? 'early' : count < 50 ? 'growing' : 'established',
    history: Array.from(byDate.entries()).map(([date, v]) => ({ date, ...v })),
    myForecast: my ? forecast(my) : null,
    forecastOpen: open,
    target
  };
}

export async function putForecast(user:User, titleId:string, input:any): Promise<void> {
  const title = await titleById(titleId);
  if (!isOpen(title.releaseDate)) throw bad('Forecasts are closed for this title');
  if (!['hit','flop'].includes(input?.choice)) throw bad('Choice is invalid');
  if (!Number.isInteger(input?.confidence) || input.confidence < 50 || input.confidence > 100) throw bad('Confidence is invalid');
  if (typeof input?.reason !== 'string' || input.reason.length > 500) throw bad('Reason is invalid');
  const stamp = now();

  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { data: existing } = await admin
        .from('forecasts')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('title_id', title.id)
        .maybeSingle();

      const { error: fError } = await admin.from('forecasts').upsert({
        user_id: user.id,
        title_id: title.id,
        choice: input.choice,
        confidence: input.confidence,
        reason: input.reason,
        title_json: title,
        created_at: stamp,
        updated_at: stamp,
      }, { onConflict: 'user_id,title_id' });
      if (fError) throw bad(fError.message);

      await admin.from('forecast_events').insert({
        user_id: user.id,
        title_id: title.id,
        choice: input.choice,
        confidence: input.confidence,
        reason: input.reason,
        created_at: stamp,
        first_submission: !existing,
        release_date: title.releaseDate,
      });
      return;
    }
  }

  const d = db();
  transaction(() => {
    const old = d.prepare('SELECT 1 FROM forecasts WHERE user_id=? AND title_id=?').get(user.id, title.id);
    d.prepare(`INSERT INTO forecasts(user_id,title_id,choice,confidence,reason,created_at,updated_at,title_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET choice=excluded.choice,confidence=excluded.confidence,reason=excluded.reason,updated_at=excluded.updated_at,title_json=excluded.title_json`).run(user.id, title.id, input.choice, input.confidence, input.reason, stamp, stamp, JSON.stringify(title));
    d.prepare('INSERT INTO forecast_events(id,user_id,title_id,choice,confidence,reason,created_at,first_submission,release_date) VALUES(?,?,?,?,?,?,?,?,?)').run(randomUUID(), user.id, title.id, input.choice, input.confidence, input.reason, stamp, old ? 0 : 1, title.releaseDate);
  });
}

export async function myForecasts(user:User): Promise<{forecast:Forecast; title:Awaited<ReturnType<typeof titleById>>}[]> {
  if (isSupabaseConfigured()) {
    const admin = supabaseAdmin();
    if (admin) {
      const { data, error } = await admin
        .from('forecasts')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (!error && data) {
        const out = [] as {forecast:Forecast; title:Awaited<ReturnType<typeof titleById>>}[];
        for (const row of data) {
          try {
            out.push({ forecast: forecast(row), title: await titleById(row.title_id) });
          } catch {
            if (row.title_json) {
              try {
                const t = typeof row.title_json === 'string' ? JSON.parse(row.title_json) : row.title_json;
                out.push({ forecast: forecast(row), title: t });
              } catch {}
            }
          }
        }
        return out;
      }
    }
  }

  const rows = db().prepare('SELECT * FROM forecasts WHERE user_id=? ORDER BY updated_at DESC').all(user.id) as any[];
  const out = [] as {forecast:Forecast; title:Awaited<ReturnType<typeof titleById>>}[];
  for (const row of rows) {
    try {
      out.push({ forecast: forecast(row), title: await titleById(row.title_id) });
    } catch {
      if (row.title_json) {
        try {
          out.push({ forecast: forecast(row), title: JSON.parse(row.title_json) });
        } catch {}
      }
    }
  }
  return out;
}
