import PresenceAvatars from './PresenceAvatars';
import { ChevronDown } from 'lucide-react';

const languages = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'cpp', label: 'C++' },
  { id: 'c', label: 'C' },
  { id: 'csharp', label: 'C#' },
  { id: 'java', label: 'Java' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'sql', label: 'SQL' },
];

export default function TopBar({ roomId, users, language, onLanguageChange, onInvite, onExport }) {
  return (
    <header className="flex h-12 items-center justify-between border-b border-app-border bg-zinc-950 px-5">
      <div className="flex items-center gap-4">
        <span className="text-xs tracking-wide text-app-subtle">Room</span>
        <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-app-text">{roomId}</span>

        {/* Language Selector */}
        <div className="relative group">
          <button
            className="flex items-center gap-1.5 rounded-md border border-app-border bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-app-text transition hover:bg-slate-800"
            title="Select language"
          >
            <span>{languages.find((l) => l.id === language)?.label || 'Language'}</span>
            <ChevronDown size={14} />
          </button>

          {/* Dropdown Menu */}
          <div className="absolute left-0 top-full mt-1 hidden w-40 rounded-md border border-app-border bg-zinc-900 shadow-lg group-hover:block z-10">
            {languages.map((lang) => (
              <button
                key={lang.id}
                onClick={() => onLanguageChange(lang.id)}
                className={`w-full px-3 py-2 text-left text-xs transition ${
                  language === lang.id
                    ? 'bg-cyan-600/20 text-cyan-400'
                    : 'text-app-text hover:bg-slate-800/60'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onInvite}
          className="rounded-md border border-app-border px-3 py-1.5 text-xs text-app-text transition hover:bg-slate-800/70"
        >
          Invite
        </button>
        <button
          type="button"
          onClick={onExport}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-white"
        >
          Export to Cloud
        </button>
        <PresenceAvatars users={users} />
      </div>
    </header>
  );
}
