import JSZip from 'jszip';
import { compilePack, type SourceFile } from '../engine/compile';
import type { GamePack } from '../engine/types';

export type Progress = (msg: string) => void;

/** Parse "owner/repo", "https://github.com/owner/repo", ".../tree/branch/sub/dir" */
export function parseGithub(input: string): { owner: string; repo: string; ref?: string; path: string } | null {
  const s = input.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.*))?)?$/) ??
    s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], ref: m[3], path: m[4] ?? '' };
}

async function gh(url: string) {
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${r.status === 403 ? 'rate limited, try again later' : r.statusText}`);
  return r.json();
}

export async function importFromGithub(input: string, progress: Progress = () => {}): Promise<GamePack> {
  const g = parseGithub(input);
  if (!g) throw new Error('Enter a GitHub repository, e.g. https://github.com/owner/repo');
  const ref = g.ref ?? (await gh(`https://api.github.com/repos/${g.owner}/${g.repo}`)).default_branch;
  progress(`Listing ${g.owner}/${g.repo} (${ref})…`);
  const list = await gh(`https://api.github.com/repos/${g.owner}/${g.repo}/contents/${g.path}?ref=${encodeURIComponent(ref)}`);
  const files = (list as { name: string; download_url: string; type: string }[])
    .filter((f) => f.type === 'file' && /\.(gst|cat|gstz|catz)$/i.test(f.name));
  if (!files.length) throw new Error('No .gst/.cat files found in that folder');
  const out: SourceFile[] = [];
  for (const [i, f] of files.entries()) {
    progress(`Downloading ${f.name} (${i + 1}/${files.length})…`);
    const r = await fetch(f.download_url);
    if (!r.ok) throw new Error(`Could not download ${f.name}`);
    out.push(...(await unpack(f.name, await r.arrayBuffer())));
  }
  progress('Compiling game pack…');
  return compilePack(out, { kind: 'github', url: `https://github.com/${g.owner}/${g.repo}/tree/${ref}/${g.path}`, importedAt: new Date().toISOString() });
}

/** .gstz/.catz/.zip are zip containers */
async function unpack(name: string, buf: ArrayBuffer): Promise<SourceFile[]> {
  if (/\.(gstz|catz|zip)$/i.test(name)) {
    const zip = await JSZip.loadAsync(buf);
    const out: SourceFile[] = [];
    for (const f of Object.values(zip.files)) {
      if (f.dir || !/\.(gst|cat)$/i.test(f.name)) continue;
      out.push({ name: f.name.split('/').pop()!, xml: await f.async('string') });
    }
    return out;
  }
  return [{ name, xml: new TextDecoder().decode(buf) }];
}

/** Local files: .gst/.cat/.gstz/.catz/.zip or a Muster .json pack */
export async function importFromFiles(files: File[], progress: Progress = () => {}): Promise<GamePack> {
  const json = files.find((f) => f.name.endsWith('.json'));
  if (json) {
    const pack = JSON.parse(await json.text()) as GamePack;
    if (pack.format !== 'muster-pack') throw new Error('That JSON file is not a Muster game pack');
    return pack;
  }
  const out: SourceFile[] = [];
  for (const f of files) {
    progress(`Reading ${f.name}…`);
    out.push(...(await unpack(f.name, await f.arrayBuffer())));
  }
  progress('Compiling game pack…');
  return compilePack(out, { kind: 'files', importedAt: new Date().toISOString() });
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
