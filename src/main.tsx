import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { Moon, Sun, Settings as Cog } from 'lucide-react';
import './index.css';
import { Home } from './pages/Home';
import { GamePage } from './pages/Game';
import { RosterEditor } from './pages/RosterEditor';
import { Cards } from './pages/Cards';
import { Settings } from './pages/Settings';
import { OfflineBadge } from './ui/kit';
import { seedPacks } from './lib/seed';

seedPacks();

try { const s = localStorage.getItem('theme'); document.documentElement.classList.toggle('dark', s ? s === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches); } catch { /* ignore */ }

function useTheme() {
  const [dark, setDark] = useState(() => {
    try { const s = localStorage.getItem('theme'); if (s) return s === 'dark'; } catch { /* ignore */ }
    return matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#17130f' : '#2b2118');
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch { /* ignore */ }
  }, [dark]);
  return [dark, setDark] as const;
}

function TopBar() {
  const [dark, setDark] = useTheme();
  const loc = useLocation();
  if (loc.pathname.startsWith('/roster/')) return null; // editor has its own header
  return (
    <header className="no-print sticky top-0 z-30 bg-paper/85 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold">
          <img src="icon.svg" alt="" className="w-7 h-7" /> Muster
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <OfflineBadge />
          <button className="btn btn-ghost !p-2" onClick={() => setDark(!dark)} aria-label="Toggle dark mode">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          <Link to="/settings" className="btn btn-ghost !p-2" aria-label="Settings"><Cog size={18} /></Link>
        </div>
      </div>
    </header>
  );
}

function App() {
  return (
    <HashRouter>
      <TopBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game/:packId" element={<GamePage />} />
        <Route path="/roster/:rosterId" element={<RosterEditor />} />
        <Route path="/roster/:rosterId/cards" element={<Cards />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
