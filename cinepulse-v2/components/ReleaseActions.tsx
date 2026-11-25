'use client';
import { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, CalendarPlus, ChevronDown, Download } from 'lucide-react';
import type { Title } from '@/lib/types';
import { buildIcs, canAddToCalendar, googleCalendarUrl, icsFileName } from '@/lib/calendar';
import { reminderEligible } from '@/lib/releaseDates';
import { titlePath } from '@/lib/slug';
import { useApp } from './Context';
import { setReminder, useReminder } from './reminderStore';

function friendlyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * "Remind me" and "Add to calendar" for titles that are not out yet. Renders nothing for released
 * titles or ones without a real release date. `className` matches the surrounding action buttons.
 */
export function ReleaseActions({ title, buttonClass = 'ovx-action' }: { title: Title; buttonClass?: string }) {
  const { user, needAuth, toast, region } = useApp();
  const on = useReminder(title.id, user?.id);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return;
        // Close only the menu, not the title popup it sits in.
        e.preventDefault();
        e.stopPropagation();
        setMenu(false);
      } else if (!menuRef.current?.contains(e.target as Node)) {
        setMenu(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close, true); };
  }, [menu]);

  if (!canAddToCalendar(title) || !reminderEligible(title.releaseDate, user?.region || region)) return null;
  const date = title.releaseDate as string;
  const pageUrl = typeof window !== 'undefined' ? new URL(titlePath(title), window.location.origin).toString() : titlePath(title);

  const toggle = async () => {
    if (!needAuth() || busy) return;
    setBusy(true);
    try {
      await setReminder(title.id, !on);
      toast(on ? 'Reminder removed.' : `We’ll remind you on ${friendlyDate(date)}.`);
    } catch (e) {
      toast((e as Error).message || 'The reminder could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const downloadIcs = () => {
    const blob = new Blob([buildIcs({ ...title, releaseDate: date }, pageUrl)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = icsFileName(title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMenu(false);
    toast('Calendar file downloaded. Open it to add the date.');
  };

  return (
    <>
      <button
        type="button"
        className={`${buttonClass} release-remind ${on ? 'is-on' : ''}`}
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={on}
        title={on ? 'You’ll get a notification on release day' : `Get a notification on ${friendlyDate(date)}`}
      >
        {on ? <BellRing size={15} /> : <Bell size={15} />} {on ? 'Reminder on' : 'Remind me'}
      </button>
      <div className="release-cal" ref={menuRef}>
        <button type="button" className={`${buttonClass} release-cal-btn`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <CalendarPlus size={15} /> Add to calendar <ChevronDown size={13} className="release-cal-chev" />
        </button>
        {menu && (
          <div className="release-cal-menu" role="menu">
            <a role="menuitem" href={googleCalendarUrl({ ...title, releaseDate: date }, pageUrl)} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(false)}>
              <CalendarPlus size={15} /> Google Calendar
            </a>
            <button type="button" role="menuitem" onClick={downloadIcs}>
              <Download size={15} /> Apple, Outlook or other (.ics)
            </button>
          </div>
        )}
      </div>
    </>
  );
}
