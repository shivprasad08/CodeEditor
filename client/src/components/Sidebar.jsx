import { Files, Users, Settings } from 'lucide-react';

const navItems = [
  { id: 'files', icon: Files },
  { id: 'users', icon: Users },
  { id: 'settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="hidden w-14 shrink-0 flex-col items-center gap-5 border-r border-app-border bg-zinc-950 py-4 sm:flex">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.id}
            className="rounded-md p-2 text-app-subtle transition hover:bg-slate-800/60 hover:text-app-text"
          >
            <Icon size={18} strokeWidth={1.75} />
          </button>
        );
      })}
    </aside>
  );
}
