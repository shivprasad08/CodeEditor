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

export default function TopBar({
  roomId,
  users,
  userName,
  language,
  onLanguageChange,
  onInvite,
  onSaveSnippet,
  onLoadSnippet,
  onDeleteSnippet,
  snippetIdInput,
  onSnippetIdInputChange,
  onRunCode,
  isCompiling,
}) {
  return (
    <header className="flex w-full flex-col gap-2 border-b border-app-border bg-zinc-950 px-3 py-2 lg:flex-row lg:items-center lg:justify-between lg:px-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <span className="hidden text-xs tracking-wide text-app-subtle sm:inline">Room</span>
        <span className="max-w-[110px] truncate rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-app-text sm:max-w-none">{roomId}</span>

        {/* Language Selector */}
        <div className="relative group">
          <button
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-app-border bg-slate-900/60 px-2.5 py-1.5 text-xs font-medium text-app-text transition hover:bg-slate-800 sm:px-3"
            title="Select language"
          >
            <span className="hidden sm:inline">{languages.find((l) => l.id === language)?.label || 'Language'}</span>
            <span className="sm:hidden">{language?.toUpperCase?.() || 'Lang'}</span>
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

      <div className="flex w-full flex-wrap items-center gap-2 sm:gap-2.5 lg:w-auto lg:justify-end">
        <button
          type="button"
          onClick={onRunCode}
          disabled={isCompiling}
          className="shrink-0 whitespace-nowrap rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isCompiling ? 'Compiling...' : 'Run'}
        </button>
        <span
          className="inline-flex h-7 shrink-0 items-center rounded-md border border-app-border bg-slate-900/70 px-2.5 text-xs font-medium text-cyan-300"
          title="Current editor"
        >
          {userName || 'You'}
        </span>
        <button
          type="button"
          onClick={onInvite}
          className="shrink-0 whitespace-nowrap rounded-md border border-app-border px-3 py-1.5 text-xs text-app-text transition hover:bg-slate-800/70"
        >
          Invite
        </button>
        <button
          type="button"
          onClick={onSaveSnippet}
          className="shrink-0 whitespace-nowrap rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-white"
        >
          Save to S3
        </button>
        <input
          type="text"
          placeholder="Snippet ID"
          value={snippetIdInput}
          onChange={(event) => onSnippetIdInputChange(event.target.value)}
          className="h-7 w-24 shrink-0 rounded-md border border-app-border bg-slate-900/70 px-2 text-xs text-app-text outline-none focus:border-cyan-500 sm:w-28"
        />
        <button
          type="button"
          onClick={onLoadSnippet}
          className="shrink-0 whitespace-nowrap rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500"
        >
          Load
        </button>
        <button
          type="button"
          onClick={onDeleteSnippet}
          className="shrink-0 whitespace-nowrap rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500"
        >
          Delete
        </button>
        <div className="shrink-0">
          <PresenceAvatars users={users} />
        </div>
      </div>
    </header>
  );
}
