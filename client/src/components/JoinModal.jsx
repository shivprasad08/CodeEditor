import { useState } from 'react';
import { Copy } from 'lucide-react';
import { generateRoomId, isValidRoomId } from '../lib/roomUtils';

export default function JoinModal({ onJoin }) {
  const [tab, setTab] = useState('join'); // 'join' or 'create'
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [generatedId, setGeneratedId] = useState('');
  const [error, setError] = useState('');

  const handleGenerateRoomId = () => {
    const newId = generateRoomId();
    setGeneratedId(newId);
    setError('');
  };

  const handleJoinRoom = () => {
    if (!username.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!roomId.trim()) {
      setError('Please enter room ID');
      return;
    }
    if (!isValidRoomId(roomId.toUpperCase())) {
      setError('Invalid room ID format (use: ABC-DEF-GHI)');
      return;
    }

    onJoin({
      username: username.trim(),
      roomId: roomId.toUpperCase(),
    });
  };

  const handleCreateRoom = () => {
    if (!username.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!generatedId) {
      setError('Generate a room ID first');
      return;
    }

    onJoin({
      username: username.trim(),
      roomId: generatedId,
      isNewRoom: true,
    });
  };

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(generatedId);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-950 to-zinc-950 p-4">
      <div className="w-full max-w-md rounded-2xl border border-app-border bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="border-b border-app-border px-6 py-6">
          <h1 className="text-2xl font-bold text-app-text">Code Together</h1>
          <p className="mt-1 text-sm text-app-subtle">Real-time collaborative editor</p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Username input (always visible) */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-app-text mb-2">Your Name</label>
            <input
              type="text"
              placeholder="e.g., Alice"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError('');
              }}
              className="w-full rounded-lg border border-app-border bg-slate-900/50 px-4 py-2 text-app-text placeholder-app-subtle focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
            />
          </div>

          {/* Tabs */}
          <div className="mb-6 flex gap-2 rounded-lg border border-app-border bg-slate-900/30 p-1">
            <button
              onClick={() => {
                setTab('join');
                setError('');
              }}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === 'join'
                  ? 'bg-slate-800 text-app-text shadow-sm'
                  : 'text-app-subtle hover:text-app-text'
              }`}
            >
              Join Room
            </button>
            <button
              onClick={() => {
                setTab('create');
                setError('');
              }}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === 'create'
                  ? 'bg-slate-800 text-app-text shadow-sm'
                  : 'text-app-subtle hover:text-app-text'
              }`}
            >
              Create Room
            </button>
          </div>

          {/* Join tab */}
          {tab === 'join' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">Room ID</label>
                <input
                  type="text"
                  placeholder="ABC-DEF-GHI"
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value.toUpperCase());
                    setError('');
                  }}
                  className="w-full rounded-lg border border-app-border bg-slate-900/50 px-4 py-2 font-mono text-app-text placeholder-app-subtle focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <button
                onClick={handleJoinRoom}
                className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 active:scale-95"
              >
                Join Room
              </button>
            </div>
          )}

          {/* Create tab */}
          {tab === 'create' && (
            <div className="space-y-4">
              {!generatedId ? (
                <button
                  onClick={handleGenerateRoomId}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-95"
                >
                  Generate Room ID
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-app-border bg-slate-900/50 px-4 py-3">
                    <span className="font-mono text-lg font-bold text-app-text">{generatedId}</span>
                    <button
                      onClick={handleCopyId}
                      className="rounded-md p-2 text-app-subtle hover:bg-slate-800 hover:text-app-text transition"
                      title="Copy room ID"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-app-subtle">Share this ID with collaborators</p>
                  <button
                    onClick={handleCreateRoom}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-95"
                  >
                    Start Editing
                  </button>
                  <button
                    onClick={handleGenerateRoomId}
                    className="w-full rounded-lg border border-app-border px-4 py-2 text-sm font-medium text-app-text transition hover:bg-slate-800"
                  >
                    Generate Different ID
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
