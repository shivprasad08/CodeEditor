const fallbackPalette = ['#06b6d4', '#8b5cf6', '#10b981', '#ec4899', '#f59e0b'];

function initials(name = 'U') {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function PresenceAvatars({ users = [] }) {
  return (
    <div className="flex items-center">
      {users.slice(0, 5).map((user, index) => (
        <div
          key={user.id || `${user.name}-${index}`}
          className={`-ml-2 flex h-7 w-7 items-center justify-center rounded-full border border-slate-900 text-[10px] font-medium text-white ${
            index === 0 ? 'ml-0' : ''
          }`}
          style={{ backgroundColor: user.color || fallbackPalette[index % fallbackPalette.length] }}
          title={user.name}
        >
          {user.initial || initials(user.name)}
        </div>
      ))}
    </div>
  );
}
