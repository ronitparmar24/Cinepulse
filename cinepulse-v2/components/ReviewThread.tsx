'use client';
/**
 * Likes and comments under a review, like the comment threads on other social apps:
 * oldest first, one level of replies, likes on comments, delete your own (or anything on your
 * own review), report the rest. Anyone can read; signing in is needed to join in.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CornerDownRight, Heart, LoaderCircle, MessageCircle, Send, Trash2, X } from 'lucide-react';
import { api } from './client';
import { useApp } from './Context';
import { AiBadge } from './AiBadge';
import { ReportButton } from './ReportButton';
import type { CommentRecord } from '@/lib/types';

const MAX = 1000;
const SHOW_REPLIES = 2;

export function timeAgo(iso: string, at = Date.now()): string {
  const s = Math.max(0, Math.round((at - new Date(iso).getTime()) / 1000));
  if (!Number.isFinite(s)) return '';
  if (s < 45) return 'now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  if (s < 604_800) return `${Math.round(s / 86_400)}d`;
  if (s < 31_536_000) return `${Math.round(s / 604_800)}w`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const HUES = [152, 190, 38, 280, 12, 220, 330];
function Avatar({ name, src, size = 30 }: { name: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const hue = HUES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];
  return (
    <span className="rt-avatar" style={{ width: size, height: size, background: `hsl(${hue} 32% 26%)`, color: `hsl(${hue} 70% 82%)` }} aria-hidden="true">
      {src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : (name.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

/** Like + comment buttons for a review, and the thread when opened. `children` go at the end of the bar (share, report…). */
export function ReviewSocial({ reviewId, authorName, likesCount = 0, commentsCount = 0, viewerLiked = false, startOpen = false, children }: {
  reviewId: string;
  authorName: string;
  likesCount?: number;
  commentsCount?: number;
  viewerLiked?: boolean;
  startOpen?: boolean;
  children?: ReactNode;
}) {
  const { user, needAuth, toast } = useApp();
  const [liked, setLiked] = useState(viewerLiked);
  const [likes, setLikes] = useState(likesCount);
  const [count, setCount] = useState(commentsCount);
  const [open, setOpen] = useState(startOpen);
  const [pop, setPop] = useState(false);
  const busy = useRef(false);

  useEffect(() => { setLiked(viewerLiked); setLikes(likesCount); }, [viewerLiked, likesCount]);
  useEffect(() => { setCount(commentsCount); }, [commentsCount]);

  const like = async () => {
    if (!needAuth() || busy.current) return;
    busy.current = true;
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    if (next) { setPop(true); window.setTimeout(() => setPop(false), 450); }
    try {
      const r = next
        ? await api<{ likesCount: number }>('/likes', 'POST', { targetType: 'review', targetId: reviewId })
        : await api<{ likesCount: number }>(`/likes?targetType=review&targetId=${encodeURIComponent(reviewId)}`, 'DELETE');
      setLikes(r.likesCount);
    } catch (e) {
      setLiked(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
      toast((e as Error).message);
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="rs">
      <div className="rs-bar">
        <button type="button" className={`rs-btn rs-like ${liked ? 'is-on' : ''} ${pop ? 'is-pop' : ''}`} onClick={() => void like()} aria-pressed={liked} aria-label={`${liked ? 'Unlike' : 'Like'} ${authorName}’s review`}>
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
          <span>{likes > 0 ? likes : 'Like'}</span>
        </button>
        <button type="button" className={`rs-btn ${open ? 'is-open' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} comments on ${authorName}’s review`}>
          <MessageCircle size={15} />
          <span>{count > 0 ? `${count} ${count === 1 ? 'comment' : 'comments'}` : user ? 'Comment' : 'Comments'}</span>
        </button>
        {children}
      </div>
      {open && <ReviewThread reviewId={reviewId} authorName={authorName} onCountChange={setCount} />}
    </div>
  );
}

export function ReviewThread({ reviewId, authorName, onCountChange }: { reviewId: string; authorName: string; onCountChange?: (n: number) => void }) {
  const { user, needAuth, toast } = useApp();
  const [items, setItems] = useState<CommentRecord[] | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: number; name: string; username: string } | null>(null);
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const load = async () => {
    setError('');
    try {
      const r = await api<{ comments: CommentRecord[] }>(`/comments?targetType=review&targetId=${encodeURIComponent(reviewId)}`);
      setItems(r.comments || []);
    } catch (e) {
      setError((e as Error).message || 'Couldn’t load comments');
      setItems([]);
    }
  };
  useEffect(() => { void load(); }, [reviewId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (items) onCountChange?.(items.filter((c) => !c.isDeleted).length);
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  const { top, replies } = useMemo(() => {
    const list = items ?? [];
    const top = list.filter((c) => !c.parentId);
    const replies = new Map<number, CommentRecord[]>();
    for (const c of list) if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c]);
    return { top, replies };
  }, [items]);

  // Grow the box with its text.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const startReply = (c: CommentRecord) => {
    if (!needAuth()) return;
    const name = c.user?.displayName || 'them';
    const username = c.user?.username || '';
    setReplyTo({ id: c.parentId ?? c.id, name, username });
    if (username && !text.startsWith(`@${username}`)) setText(`@${username} ${text}`.trimStart());
    setExpanded((s) => new Set(s).add(c.parentId ?? c.id));
    window.setTimeout(() => box.current?.focus(), 0);
  };

  const post = async () => {
    const body = text.trim();
    if (!body || posting || !needAuth()) return;
    setPosting(true);
    try {
      const r = await api<{ comment: CommentRecord }>('/comments', 'POST', { targetType: 'review', targetId: reviewId, body, parentId: replyTo?.id ?? null });
      setItems((list) => [...(list ?? []), r.comment]);
      setFresh(r.comment.id);
      window.setTimeout(() => setFresh(null), 1600);
      setText('');
      setReplyTo(null);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setPosting(false);
    }
  };

  const remove = async (c: CommentRecord) => {
    setConfirmDelete(null);
    const before = items;
    const hasReplies = (replies.get(c.id) ?? []).some((x) => !x.isDeleted);
    setItems((list) => (list ?? []).flatMap((x) => (x.id !== c.id ? [x] : hasReplies ? [{ ...x, isDeleted: true, body: '[Comment deleted]', canDelete: false, likesCount: 0 }] : [])));
    try { await api(`/comments/${c.id}`, 'DELETE'); } catch (e) { setItems(before); toast((e as Error).message); }
  };

  const toggleLike = async (c: CommentRecord) => {
    if (!needAuth() || c.isDeleted) return;
    const next = !c.viewerLiked;
    const patch = (liked: boolean, delta: number) => setItems((list) => (list ?? []).map((x) => (x.id === c.id ? { ...x, viewerLiked: liked, likesCount: Math.max(0, (x.likesCount ?? 0) + delta) } : x)));
    patch(next, next ? 1 : -1);
    try {
      if (next) await api('/likes', 'POST', { targetType: 'comment', targetId: String(c.id) });
      else await api(`/likes?targetType=comment&targetId=${c.id}`, 'DELETE');
    } catch (e) {
      patch(!next, next ? -1 : 1);
      toast((e as Error).message);
    }
  };

  const row = (c: CommentRecord, isReply = false) => {
    const name = c.user?.displayName || 'Member';
    const username = c.user?.username && c.user.username !== 'deleted' ? c.user.username : null;
    return (
      <li key={c.id} className={`rt-item ${isReply ? 'is-reply' : ''} ${fresh === c.id ? 'is-fresh' : ''} ${c.isDeleted ? 'is-deleted' : ''}`}>
        <Avatar name={c.isDeleted ? '?' : name} src={c.user?.avatarUrl} size={isReply ? 24 : 30} />
        <div className="rt-main">
          <div className="rt-bubble">
            {!c.isDeleted && (
              <div className="rt-who">
                {username ? <a href={`/u/${encodeURIComponent(username)}`}>{name}</a> : <b>{name}</b>}
                {c.user?.isAi && <AiBadge />}
                <time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString('en-IN')}>{timeAgo(c.createdAt)}</time>
              </div>
            )}
            <p>{c.isDeleted ? 'This comment was deleted.' : renderBody(c.body)}</p>
          </div>
          {!c.isDeleted && (
            <div className="rt-actions">
              <button type="button" className={`rt-act ${c.viewerLiked ? 'is-on' : ''}`} onClick={() => void toggleLike(c)} aria-pressed={Boolean(c.viewerLiked)} aria-label={`${c.viewerLiked ? 'Unlike' : 'Like'} ${name}’s comment`}>
                <Heart size={12} fill={c.viewerLiked ? 'currentColor' : 'none'} />{(c.likesCount ?? 0) > 0 ? c.likesCount : ''}
              </button>
              <button type="button" className="rt-act" onClick={() => startReply(c)}>Reply</button>
              {c.canDelete && (confirmDelete === c.id ? (
                <span className="rt-confirm">Delete? <button type="button" onClick={() => void remove(c)}>Yes</button><button type="button" onClick={() => setConfirmDelete(null)}>No</button></span>
              ) : (
                <button type="button" className="rt-act" onClick={() => setConfirmDelete(c.id)} aria-label="Delete comment"><Trash2 size={12} /></button>
              ))}
              {user && !c.isOwner && <ReportButton targetType="comment" targetId={String(c.id)} authorId={c.userId} className="rt-act rt-report" />}
            </div>
          )}
        </div>
      </li>
    );
  };

  const left = MAX - text.length;
  return (
    <div className="rt" aria-label={`Comments on ${authorName}’s review`}>
      {items === null ? (
        <div className="rt-skeleton" aria-label="Loading comments">
          {[0, 1].map((i) => <div key={i} className="rt-skel-row"><i /><span><b /><b /></span></div>)}
        </div>
      ) : error ? (
        <p className="rt-empty">{error} <button type="button" className="text-link" onClick={() => { setItems(null); void load(); }}>Try again</button></p>
      ) : top.length === 0 ? (
        <p className="rt-empty">No comments yet. {user ? 'Start the conversation.' : ''}</p>
      ) : (
        <ul className="rt-list">
          {top.map((c) => {
            const kids = replies.get(c.id) ?? [];
            const showAll = expanded.has(c.id) || kids.length <= SHOW_REPLIES;
            const shown = showAll ? kids : kids.slice(-SHOW_REPLIES);
            return (
              <li key={c.id} className="rt-thread">
                <ul className="rt-sub">{row(c)}</ul>
                {kids.length > 0 && (
                  <ul className="rt-replies">
                    {!showAll && (
                      <li><button type="button" className="rt-more" onClick={() => setExpanded((s) => new Set(s).add(c.id))}><CornerDownRight size={12} /> View {kids.length - SHOW_REPLIES} earlier {kids.length - SHOW_REPLIES === 1 ? 'reply' : 'replies'}</button></li>
                    )}
                    {shown.map((r) => row(r, true))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {user ? (
        <form className="rt-compose" onSubmit={(e) => { e.preventDefault(); void post(); }}>
          {replyTo && (
            <div className="rt-replying">Replying to <b>{replyTo.name}</b>
              <button type="button" onClick={() => { setReplyTo(null); if (replyTo.username) setText((t) => t.replace(new RegExp(`^@${replyTo.username}\\s*`), '')); }} aria-label="Cancel reply"><X size={12} /></button>
            </div>
          )}
          <div className="rt-input">
            <Avatar name={user.name || 'You'} size={30} />
            <textarea
              ref={box}
              value={text}
              rows={1}
              maxLength={MAX}
              placeholder={replyTo ? `Reply to ${replyTo.name}…` : `Add a comment for ${authorName}…`}
              aria-label="Write a comment"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void post(); } }}
            />
            <button type="submit" className="rt-send" disabled={!text.trim() || posting} aria-label="Post comment">
              {posting ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
            </button>
          </div>
          {left < 150 && <small className={`rt-count ${left < 0 ? 'is-over' : ''}`}>{left}</small>}
        </form>
      ) : (
        <button type="button" className="rt-signin" onClick={() => needAuth()}>Sign in to join the conversation</button>
      )}
    </div>
  );
}

/** Plain text with @mentions highlighted (no HTML from users ever reaches the page). */
function renderBody(body: string): ReactNode {
  const parts = body.split(/(@[a-z0-9_.]{2,30})/gi);
  return parts.map((p, i) => (/^@[a-z0-9_.]{2,30}$/i.test(p) ? <a key={i} className="rt-mention" href={`/u/${encodeURIComponent(p.slice(1))}`}>{p}</a> : p));
}
