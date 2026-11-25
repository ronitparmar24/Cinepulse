'use client';
import { useState } from 'react';
import { Flag, LoaderCircle } from 'lucide-react';
import { Modal } from './UI';
import { api } from './client';
import { useApp } from './Context';

const REASONS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'spoilers', label: 'Spoilers without a warning', hint: 'Gives away the plot and isn’t marked as a spoiler' },
  { id: 'harassment', label: 'Harassment or hate', hint: 'Attacks a person or group' },
  { id: 'spam', label: 'Spam or advertising', hint: 'Links, promotions or repeated posts' },
  { id: 'off_topic', label: 'Off-topic', hint: 'Not about the film or the conversation' },
  { id: 'other', label: 'Something else', hint: 'Tell us below' },
];

/** "Report" for someone else's review or comment. Hidden when signed out or for your own posts. */
export function ReportButton({ targetType, targetId, authorId, className = 'report-link' }: { targetType: 'review' | 'comment'; targetId: string; authorId: string; className?: string }) {
  const { user, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (!user || user.id === authorId) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || busy) return;
    setBusy(true);
    try {
      const res = await api<{ alreadyReported: boolean; hidden: boolean }>('/reports', 'POST', { targetType, targetId, reason, note: note.trim() || undefined });
      setDone(true);
      setOpen(false);
      toast(res.alreadyReported ? 'You already reported this. Thanks — it’s with our moderators.' : 'Thanks for flagging it. Our moderators will take a look.');
    } catch (err) {
      toast((err as Error).message || 'The report could not be sent.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={done} aria-label={done ? 'Reported' : `Report this ${targetType}`}>
        <Flag size={13} /> {done ? 'Reported' : 'Report'}
      </button>
      {open && (
        <Modal label={`Report this ${targetType}`} onClose={() => setOpen(false)}>
          <form className="report-form" onSubmit={submit}>
            <span className="report-icon"><Flag size={20} /></span>
            <h2>Report this {targetType}</h2>
            <p>Reports are private. The author isn’t told who reported them. If several people report the same post, it’s hidden until a moderator reviews it.</p>
            <fieldset>
              <legend className="sr-only">Reason</legend>
              {REASONS.map((r) => (
                <label key={r.id} className={`report-reason ${reason === r.id ? 'is-on' : ''}`}>
                  <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                  <span><b>{r.label}</b><small>{r.hint}</small></span>
                </label>
              ))}
            </fieldset>
            <label className="report-note">
              <span>Anything else? <small>(optional)</small></span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} placeholder="Add details for the moderators" />
            </label>
            <div className="report-actions">
              <button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="button primary" disabled={!reason || busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Flag size={15} />} Send report</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
