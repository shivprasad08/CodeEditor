import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import EditorPane from './components/EditorPane';
import JoinModal from './components/JoinModal';
import { socket } from './lib/socket';
import { languageTemplates } from './lib/languageTemplates';

const REMOTE_CURSOR_IDLE_MS = 1800;

const apiCandidates = [
  import.meta.env.VITE_API_URL,
  import.meta.env.VITE_SERVER_URL,
  'http://localhost:4000',
  'http://localhost:3000',
].filter(Boolean);

async function fetchWithFallback(path, options) {
  let lastError = null;

  for (const base of apiCandidates) {
    try {
      const response = await fetch(`${base}${path}`, options);
      if (response.ok) {
        return { response, base };
      }

      // For 404 in one deployment topology, try next candidate.
      if (response.status !== 404) {
        return { response, base };
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error('No API endpoint responded');
}

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [code, setCode] = useState('');
  const [users, setUsers] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [localUserId, setLocalUserId] = useState('');
  const [joinError, setJoinError] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [compileInput, setCompileInput] = useState('');
  const [compileOutput, setCompileOutput] = useState([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [snippetIdInput, setSnippetIdInput] = useState('');
  const [snippetIdLoaded, setSnippetIdLoaded] = useState('');
  const isRemoteUpdate = useRef(false);
  const suppressCursorBroadcastUntilRef = useRef(0);
  const lastCursorEmitRef = useRef(0);
  const localUserIdRef = useRef('');
  const languageRef = useRef('javascript');
  const previousTemplateRef = useRef(languageTemplates.javascript);

  const handleJoinRoom = ({ username, roomId: room }) => {
    // Set up join handlers FIRST, before emitting
    const handleJoinSuccess = ({ userId }) => {
      localUserIdRef.current = userId;
      setLocalUserId(userId);
    };

    const handleJoinError = ({ message }) => {
      setJoinError(message);
      // Cleanup on error
      socket.off('join-success', handleJoinSuccess);
      socket.off('join-error', handleJoinError);
    };

    // Register handlers before emitting
    socket.once('join-success', handleJoinSuccess);
    socket.once('join-error', handleJoinError);

    // NOW emit join-room
    socket.emit('join-room', {
      roomId: room,
      name: username,
    });

    setUserName(username);
    setRoomId(room);
    setJoinError('');
    
    // Initialize with JavaScript template
    setCode(languageTemplates.javascript);
    previousTemplateRef.current = languageTemplates.javascript;
  };

  // Keep localUserIdRef in sync for closure access
  useEffect(() => {
    localUserIdRef.current = localUserId;
  }, [localUserId]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    if (!roomId || !userName) {
      return;
    }

    const handleDocumentChange = ({ content, language: nextLanguage }) => {
      isRemoteUpdate.current = true;
      // Remote text patches can move local caret on this client; do not rebroadcast that movement.
      suppressCursorBroadcastUntilRef.current = Date.now() + 180;

      if (typeof nextLanguage === 'string' && nextLanguage && nextLanguage !== languageRef.current) {
        setLanguage(nextLanguage);
        previousTemplateRef.current = languageTemplates[nextLanguage] || languageTemplates.javascript;
      }

      setCode(typeof content === 'string' ? content : '');
    };

    const handleRoomUsers = ({ users: roomUsers }) => {
      setUsers(roomUsers || []);
      setRemoteCursors((prev) => {
        const validIds = new Set((roomUsers || []).map((user) => user.id));
        return Object.fromEntries(Object.entries(prev).filter(([userId]) => validIds.has(userId)));
      });
    };

    const handleCursorChange = ({ user, position, selection }) => {
      if (!user?.id || !position) {
        return;
      }

      // Prevent adding local user's cursor to remote cursors
      if (user.id === localUserIdRef.current) {
        return;
      }

      setRemoteCursors((prev) => ({
        ...prev,
        [user.id]: { user, position, selection, lastSeenAt: Date.now() },
      }));
    };

    const handlePresenceSnapshot = ({ users: presenceUsers }) => {
      if (!Array.isArray(presenceUsers)) {
        return;
      }

      setRemoteCursors((prev) => {
        const next = { ...prev };
        presenceUsers.forEach(({ user, position, selection }) => {
          if (!user?.id || user.id === localUserIdRef.current || !position) {
            return;
          }
          next[user.id] = { user, position, selection, lastSeenAt: Date.now() };
        });
        return next;
      });
    };

    const handleCursorRemove = ({ userId }) => {
      if (!userId) {
        return;
      }

      setRemoteCursors((prev) => {
        if (!prev[userId]) {
          return prev;
        }

        const next = { ...prev };
        delete next[userId];
        return next;
      });
    };

    const handleCompileStatus = ({ status }) => {
      if (!status) {
        return;
      }

      setIsCompiling(status === 'queued' || status === 'running');
    };

    const handleCompileOutput = ({ output, ok, language: outputLanguage, runner, durationMs, queueWaitMs }) => {
      const statusLabel = ok ? '✅' : '❌';
      const header = `${statusLabel} ${String(outputLanguage || language).toUpperCase()} (${runner || 'runner'})`;
      const meta = `queue=${queueWaitMs ?? 0}ms | exec=${durationMs ?? 0}ms`;
      const body = output || 'No output.';

      setCompileOutput((prev) => [
        ...prev,
        `${header}\n${meta}\n${body}`,
      ]);
      setIsCompiling(false);
    };

    socket.on('document-change', handleDocumentChange);
    socket.on('room-users', handleRoomUsers);
    socket.on('cursor-change', handleCursorChange);
    socket.on('presence-snapshot', handlePresenceSnapshot);
    socket.on('cursor-remove', handleCursorRemove);
    socket.on('compile-status', handleCompileStatus);
    socket.on('compile-output', handleCompileOutput);

    return () => {
      socket.off('document-change', handleDocumentChange);
      socket.off('room-users', handleRoomUsers);
      socket.off('cursor-change', handleCursorChange);
      socket.off('presence-snapshot', handlePresenceSnapshot);
      socket.off('cursor-remove', handleCursorRemove);
      socket.off('compile-status', handleCompileStatus);
      socket.off('compile-output', handleCompileOutput);
    };
  }, [roomId, userName, language]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const cutoff = Date.now() - REMOTE_CURSOR_IDLE_MS;

      setRemoteCursors((prev) => {
        let changed = false;
        const next = {};

        Object.entries(prev).forEach(([userId, cursor]) => {
          if ((cursor?.lastSeenAt || 0) >= cutoff) {
            next[userId] = cursor;
            return;
          }
          changed = true;
        });

        return changed ? next : prev;
      });
    }, 450);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const handleCodeChange = (nextCode) => {
    setCode(nextCode);

    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    socket.emit('document-change', {
      roomId,
      content: nextCode,
      language,
    });
  };

  const handleLanguageChange = (nextLanguage) => {
    if (!nextLanguage || nextLanguage === language) {
      return;
    }

    const nextTemplate = languageTemplates[nextLanguage] || languageTemplates.javascript;
    const shouldSwapTemplate = !code || code.trim() === previousTemplateRef.current.trim();
    const nextCode = shouldSwapTemplate ? nextTemplate : code;

    setLanguage(nextLanguage);
    setCode(nextCode);
    previousTemplateRef.current = nextTemplate;

    socket.emit('document-change', {
      roomId,
      content: nextCode,
      language: nextLanguage,
    });
  };

  const handleCursorChange = ({ position, selection }) => {
    if (Date.now() < suppressCursorBroadcastUntilRef.current) {
      return;
    }

    const now = Date.now();
    if (now - lastCursorEmitRef.current < 35) {
      return;
    }

    lastCursorEmitRef.current = now;

    socket.emit('cursor-change', {
      roomId,
      position,
      selection,
    });
  };

  const handleInvite = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}?room=${roomId}`);
  };

  const handleSaveSnippet = async () => {
    try {
      const { response } = await fetchWithFallback('/snippets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, language }),
      });

      if (!response.ok) {
        alert('Failed to save snippet.');
        return;
      }

      const data = await response.json();
      setSnippetIdInput(data.snippetId);
      setSnippetIdLoaded(data.snippetId);
      setCompileOutput((prev) => [...prev, `Snippet saved with ID: ${data.snippetId}`]);
      alert(`Snippet Saved!\nSnippet ID: ${data.snippetId}`);
    } catch (error) {
      alert('Error saving snippet.');
    }
  };

  const handleLoadSnippet = async () => {
    if (!snippetIdInput) {
      alert('Please enter a snippet ID first.');
      return;
    }

    try {
      const { response } = await fetchWithFallback(`/snippets/${snippetIdInput}`);

      if (!response.ok) {
        alert('Snippet not found.');
        return;
      }

      const data = await response.json();
      setCode(data.code || '');
      setLanguage(data.language || 'javascript');
      previousTemplateRef.current = languageTemplates[data.language] || languageTemplates.javascript;
      setSnippetIdLoaded(snippetIdInput);
      setCompileOutput((prev) => [...prev, `Loaded snippet: ${snippetIdInput}`]);

      // Keep collaborators in sync after loading a snippet.
      socket.emit('document-change', {
        roomId,
        content: data.code || '',
        language: data.language || 'javascript',
      });
    } catch (error) {
      alert('Error loading snippet.');
    }
  };

  const handleDeleteSnippet = async () => {
    const idToDelete = snippetIdLoaded || snippetIdInput;

    if (!idToDelete) {
      alert('No snippet ID specified to delete.');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${idToDelete} from S3?`)) {
      return;
    }

    try {
      const { response } = await fetchWithFallback(`/snippets/${idToDelete}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        alert('Failed to delete snippet.');
        return;
      }

      setCompileOutput((prev) => [...prev, `Deleted snippet: ${idToDelete}`]);
      if (snippetIdLoaded === idToDelete) {
        setSnippetIdLoaded('');
      }
      alert(`Deleted snippet ${idToDelete}`);
    } catch (error) {
      alert('Error deleting snippet.');
    }
  };

  const handleRunCode = async () => {
    if (!roomId || !language) {
      return;
    }

    setIsCompiling(true);

    try {
      const { response } = await fetchWithFallback('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          code,
          language,
          input: compileInput,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        setCompileOutput((prev) => [...prev, `❌ Failed to submit\n${text}`]);
        setIsCompiling(false);
      }
    } catch (error) {
      setCompileOutput((prev) => [
        ...prev,
        `❌ Failed to submit\nCould not reach API on: ${apiCandidates.join(', ')}`,
      ]);
      setIsCompiling(false);
    }
  };

  // Show join modal if not in a room
  if (!roomId || !userName) {
    return <JoinModal onJoin={handleJoinRoom} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-app-text">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar 
          roomId={roomId} 
          users={users} 
          userName={userName}
          language={language}
          onLanguageChange={handleLanguageChange}
          onInvite={handleInvite} 
          onSaveSnippet={handleSaveSnippet}
          onLoadSnippet={handleLoadSnippet}
          onDeleteSnippet={handleDeleteSnippet}
          snippetIdInput={snippetIdInput}
          onSnippetIdInputChange={setSnippetIdInput}
          onRunCode={handleRunCode}
          isCompiling={isCompiling}
        />

        <div className="relative flex-1 p-2 sm:p-4">
          <div className="grid h-full w-full grid-rows-[minmax(0,1fr)_240px] gap-2 overflow-hidden sm:grid-rows-[1fr_220px] sm:gap-3">
            <div className="overflow-hidden rounded-xl border border-app-border bg-app-bg shadow-panel">
              <EditorPane
                value={code}
                onChange={handleCodeChange}
                onCursorChange={handleCursorChange}
                remoteCursors={Object.values(remoteCursors)}
                localUserId={localUserId}
                language={language}
              />
            </div>

            <div className="grid grid-cols-1 gap-2 overflow-hidden rounded-xl border border-app-border bg-app-bg p-2 shadow-panel sm:grid-cols-[260px_1fr] sm:gap-3 sm:p-3">
              <div className="flex min-h-0 flex-col gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-app-subtle">Input</div>
                <textarea
                  value={compileInput}
                  onChange={(event) => setCompileInput(event.target.value)}
                  placeholder="stdin input..."
                  className="h-24 min-h-0 w-full resize-none rounded-md border border-app-border bg-slate-900/70 p-2 text-xs text-app-text outline-none focus:border-cyan-500 sm:h-full"
                />
              </div>

              <div className="flex min-h-0 flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wide text-app-subtle">Output</div>
                  <button
                    onClick={() => setCompileOutput([])}
                    className="text-xs text-app-subtle transition hover:text-app-text"
                  >
                    Clear
                  </button>
                </div>
                <div className="h-full min-h-0 overflow-auto rounded-md border border-app-border bg-slate-950 p-2 font-mono text-xs text-emerald-300">
                  {compileOutput.length === 0 ? (
                    <div className="text-app-subtle">No output yet. Click Run to execute.</div>
                  ) : (
                    compileOutput.map((line, index) => (
                      <pre key={`${index}-${line.slice(0, 16)}`} className="mb-3 whitespace-pre-wrap">
                        {line}
                      </pre>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
