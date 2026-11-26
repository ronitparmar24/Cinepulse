'use client';
import { useEffect, useState } from 'react';
import { Check, Copy, Download, ImageIcon, LoaderCircle, Share2 } from 'lucide-react';
import { Modal } from './UI';
import { useApp } from './Context';

type Format = 'story' | 'square';

/**
 * Share a review (or a "just watched" log) as an image made for social apps — Instagram/WhatsApp
 * stories or a feed post — plus a link that unfurls into a rich preview.
 */
export function ShareSheet({ kind, id, title, version, onClose }: { kind: 'review' | 'watched'; id: string; title: string; version?: string; onClose: () => void }) {
  const { toast } = useApp();
  const [format, setFormat] = useState<Format>('story');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const v = encodeURIComponent(version || '1');
  const imageUrl = `/api/share/${kind}/${encodeURIComponent(id)}?format=${format}&v=${v}`;
  const pageUrl = kind === 'review' && typeof window !== 'undefined' ? `${window.location.origin}/r/${encodeURIComponent(id)}` : null;
  const text = kind === 'review' ? `My review of ${title} on CinePulse` : `Just watched ${title} — logged on CinePulse`;
  useEffect(() => { setLoaded(false); }, [imageUrl]);

  const getFile = async () => {
    const res = await fetch(imageUrl, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('The image could not be made right now.');
    const blob = await res.blob();
    return new File([blob], `cinepulse-${kind}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}-${format}.png`, { type: 'image/png' });
  };

  const shareImage = async () => {
    setBusy(true);
    try {
      const file = await getFile();
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try { await nav.share({ files: [file], title: text, text: pageUrl ? `${text} ${pageUrl}` : text }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
      }
      save(file);
      toast('Image saved. Post it from your gallery.');
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  const save = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const download = async () => { setBusy(true); try { save(await getFile()); } catch (e) { toast((e as Error).message); } finally { setBusy(false); } };
  const copy = async () => {
    if (!pageUrl) return;
    try { await navigator.clipboard.writeText(pageUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { toast(pageUrl); }
  };
  const enc = encodeURIComponent;
  const links = pageUrl ? [
    { name: 'WhatsApp', href: `https://wa.me/?text=${enc(`${text} ${pageUrl}`)}` },
    { name: 'X', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(pageUrl)}` },
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(pageUrl)}` },
    { name: 'Threads', href: `https://www.threads.net/intent/post?text=${enc(`${text} ${pageUrl}`)}` },
    { name: 'Telegram', href: `https://t.me/share/url?url=${enc(pageUrl)}&text=${enc(text)}` },
  ] : [];

  return (
    <Modal label={`Share ${title}`} onClose={onClose}>
      <div className="sh">
        <div className="sh-head">
          <span className="sh-icon"><Share2 size={18} /></span>
          <div><span className="eyebrow mint">SHARE</span><h2>{kind === 'review' ? 'Share your review' : 'Share what you watched'}</h2></div>
        </div>
        <div className="sh-formats" role="tablist" aria-label="Image size">
          {(['story', 'square'] as Format[]).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={format === f} className={format === f ? 'is-on' : ''} onClick={() => setFormat(f)}>
              {f === 'story' ? 'Story · 9:16' : 'Post · 4:5'}
            </button>
          ))}
        </div>
        <div className={`sh-preview is-${format}`}>
          {!loaded && <span className="sh-loading"><LoaderCircle size={22} className="spin" /> Making your card…</span>}
          <img key={imageUrl} src={imageUrl} alt={`Share card for ${title}`} onLoad={() => setLoaded(true)} onError={() => { setLoaded(true); toast('The image could not be made right now.'); }} style={{ opacity: loaded ? 1 : 0 }} />
        </div>
        <div className="sh-actions">
          <button type="button" className="button primary" onClick={() => void shareImage()} disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <ImageIcon size={16} />} Share image</button>
          <button type="button" className="button secondary" onClick={() => void download()} disabled={busy}><Download size={16} /> Save</button>
          {pageUrl && <button type="button" className="button secondary" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy link'}</button>}
        </div>
        {links.length > 0 && (
          <div className="sh-links">{links.map((l) => <a key={l.name} href={l.href} target="_blank" rel="noopener noreferrer">{l.name}</a>)}</div>
        )}
        <p className="sh-hint">For Instagram, tap <b>Share image</b> on your phone and pick Instagram → Story or Post.{kind === 'review' ? ' Links show your card as a preview wherever you paste them.' : ''}</p>
      </div>
    </Modal>
  );
}
