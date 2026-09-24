import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Tooltip that works with mouse (hover), touch (tap) and keyboard (focus).
 * Renders in a portal so it is never clipped by scrolling panels.
 */
export function Tip({ title, content, children, className = '', as = 'button' }: {
  title?: ReactNode; content?: ReactNode; children: ReactNode; className?: string; as?: 'button' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const hoverable = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover)').matches;
  const has = !!(content || title);

  useLayoutEffect(() => {
    if (!open || !ref.current || !tip.current) return;
    const r = ref.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const above = r.bottom + t.height + 12 > innerHeight && r.top > t.height + 12;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8);
    setPos({ left, top: above ? r.top - t.height - 8 : r.bottom + 8, above });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current?.contains(e.target as Node) || tip.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const scroll = () => setOpen(false);
    addEventListener('pointerdown', close, true);
    addEventListener('keydown', esc);
    addEventListener('scroll', scroll, true);
    return () => { removeEventListener('pointerdown', close, true); removeEventListener('keydown', esc); removeEventListener('scroll', scroll, true); };
  }, [open]);

  const Tag = as as 'button';
  return (
    <>
      <Tag
        ref={ref as never}
        type={as === 'button' ? 'button' : undefined}
        tabIndex={as === 'span' ? 0 : undefined}
        className={`${className} ${has ? 'cursor-help' : ''}`}
        aria-expanded={has ? open : undefined}
        onMouseEnter={() => hoverable && has && setOpen(true)}
        onMouseLeave={() => hoverable && setOpen(false)}
        onFocus={() => has && hoverable && setOpen(true)}
        onBlur={() => hoverable && setOpen(false)}
        onClick={(e) => { if (!has) return; e.stopPropagation(); setOpen((o) => (hoverable ? true : !o)); }}
      >
        {children}
      </Tag>
      {open && has && createPortal(
        <div
          ref={tip}
          role="tooltip"
          className="fixed z-[100] max-w-[min(22rem,calc(100vw-16px))] rounded-xl bg-ink text-paper shadow-2xl px-3.5 py-2.5 text-[13px] leading-snug pointer-events-auto"
          style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
        >
          {title && <div className="font-semibold font-display text-[15px] mb-1">{title}</div>}
          {content && <div className="whitespace-pre-line text-paper/85">{content}</div>}
        </div>,
        document.body,
      )}
    </>
  );
}
