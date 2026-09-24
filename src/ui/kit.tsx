import { useEffect, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, WifiOff } from 'lucide-react';
import { db } from '../lib/db';
import { artUrl, bundledArt, type ArtManifest } from '../lib/art';
import type { GamePack } from '../engine/types';

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    addEventListener('online', up); addEventListener('offline', down);
    return () => { removeEventListener('online', up); removeEventListener('offline', down); };
  }, []);
  return on;
}

export function OfflineBadge() {
  const on = useOnline();
  if (on) return null;
  return <span className="pill" title="Everything still works offline"><WifiOff size={12} /> Offline</span>;
}

/** All art for a pack as { 'kind|name': url }: bundled art first, then any ePUB art imported in this browser */
export function useArt(packId?: string) {
  const rows = useLiveQuery(() => (packId ? db.art.where('packId').equals(packId).toArray() : []), [packId]);
  const packRow = useLiveQuery(() => (packId ? db.packs.get(packId) : undefined), [packId]);
  const [bundle, setBundle] = useState<ArtManifest | null>(null);
  useEffect(() => {
    let live = true;
    if (packRow?.pack) bundledArt(packRow.pack).then((m) => live && setBundle(m));
    return () => { live = false; };
  }, [packRow?.id]);
  const map: Record<string, string> = {};
  if (bundle) {
    if (bundle.cover) map['cover|cover'] = bundle.cover;
    for (const [k, v] of Object.entries(bundle.faction)) map[`faction|${k}`] = v;
    for (const [k, v] of Object.entries(bundle.unit)) map[`unit|${k}`] = v;
    bundle.scene.forEach((v, i) => (map[`scene|${i}`] = v));
  }
  for (const r of rows ?? []) map[`${r.kind}|${r.name}`] = artUrl(r)!;
  return map;
}

export function artFor(art: Record<string, string>, kind: string, name: string) {
  return art[`${kind}|${name}`];
}

export function usePack(packId?: string): GamePack | undefined | null {
  const row = useLiveQuery(() => (packId ? db.packs.get(packId) : undefined), [packId], null);
  if (row === null) return undefined; // loading
  return row?.pack ?? null;
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative card w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92dvh] flex flex-col rounded-b-none sm:rounded-b-[14px] shadow-2xl`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn btn-ghost !p-2" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="scroll-y p-5 safe-bottom">{children}</div>
      </div>
    </div>
  );
}

export function Portrait({ src, name, size = 48, className = '' }: { src?: string; name: string; size?: number; className?: string }) {
  const initials = name.replace(/\(.*\)/, '').split(/[\s/]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return src ? (
    <img src={src} alt="" loading="lazy" className={`object-cover object-top rounded-xl bg-paper-2 shrink-0 ${className}`} style={{ width: size, height: size }} />
  ) : (
    <div className={`rounded-xl bg-paper-2 text-ink-3 font-display font-semibold grid place-items-center shrink-0 ${className}`} style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initials}
    </div>
  );
}

export function fmtCosts(pack: GamePack, costs: Record<string, number>, opts: { showZero?: boolean } = {}) {
  return pack.costTypes
    .filter((t) => !t.hidden && (opts.showZero || costs[t.id]))
    .map((t) => `${costs[t.id] ?? 0} ${t.name}`)
    .join(' · ');
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-14 px-6 text-ink-2">
      <div className="mx-auto mb-3 w-12 h-12 grid place-items-center rounded-full bg-paper-2 text-accent">{icon}</div>
      <h3 className="text-lg font-semibold text-ink mb-1">{title}</h3>
      <div className="text-sm max-w-sm mx-auto">{children}</div>
    </div>
  );
}
