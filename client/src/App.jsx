import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import EditorPane from './components/EditorPane';
import JoinModal from './components/JoinModal';
import { socket } from './lib/socket';
import { languageTemplates } from './lib/languageTemplates';

const REMOTE_CURSOR_IDLE_MS = 1800;
const MIN_SECTION_HEIGHT = 80;
const SPLITTER_HEIGHT = 5;

function isLocalOrIpHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

function isHostedDeployment() {
  if (typeof window === 'undefined') {
    return false;
  }

  return !isLocalOrIpHost(window.location.hostname);
}

function getRuntimeApiBase() {
  if (typeof window === 'undefined') {
    return null;
  }

  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const host = window.location.hostname;
  if (!host) {
    return null;
  }

  if (isLocalOrIpHost(host)) {
    return `${protocol}//${host}:4000`;
  }

  // Hosted frontend (e.g. Vercel): use same-origin + rewrite/proxy rules.
  return window.location.origin;
}

const apiCandidates = (isHostedDeployment()
  ? [window.location.origin]
  : [
      getRuntimeApiBase(),
      import.meta.env.VITE_API_URL,
      import.meta.env.VITE_SERVER_URL,
      'http://localhost:4000',
      'http://localhost:3000',
    ]
).filter(Boolean);

async function fetchWithFallback(path, options) {
  let lastError = null;
  
  // For hosted deployments, only try the primary endpoint (Vercel rewrite)
  const endpointsToTry = isHostedDeployment() ? [apiCandidates[0]] : apiCandidates;

  for (const base of endpointsToTry) {
    if (!base) continue;
    try {
      const response = await fetch(`${base}${path}`, options);
      if (response.ok) {
        return { response, base };
      }

      // If hosted, fail immediately (don't try fallbacks)
      if (isHostedDeployment()) {
        return { response, base };
      }

      // For local, only continue on 404 (other errors might be worth retrying elsewhere)
      if (response.status !== 404) {
        return { response, base };
      }
    } catch (error) {
      lastError = error;
      
      // If hosted, throw immediately (don't try fallbacks)
      if (isHostedDeployment()) {
        throw error;
      }
    }
  }

  // No candidates worked
  if (lastError) {
    throw lastError;
  }
  throw new Error('No API endpoint responded');
}

export default function App() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const savedTheme = window.localStorage.getItem('app-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
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
  const [ioPanelHeight, setIoPanelHeight] = useState(220);
  const isRemoteUpdate = useRef(false);
  const contentRef = useRef(null);
  const isDraggingSplitterRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartIoHeightRef = useRef(220);
  const suppressCursorBroadcastUntilRef = useRef(0);
  const lastCursorEmitRef = useRef(0);
  const localUserIdRef = useRef('');
  const languageRef = useRef('javascript');
  const previousTemplateRef = useRef(languageTemplates.javascript);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('app-theme', theme);
  }, [theme]);

  const handleJoinRoom = ({ username, roomId: room }) => {
    const trimmedName = username?.trim() || '';
    const normalizedRoom = room?.trim().toUpperCase() || '';

    if (!trimmedName || !normalizedRoom) {
      setJoinError('Name and room ID are required.');
      return;
    }

    setJoinError('');

    // Set up join handlers first, then emit only when socket is connected.
    const emitJoin = () => {
      socket.emit('join-room', {
        roomId: normalizedRoom,
        name: trimmedName,
      });
    };

    const handleJoinSuccess = ({ userId }) => {
      window.clearTimeout(joinTimeout);
      localUserIdRef.current = userId;
      setLocalUserId(userId);

      setUserName(trimmedName);
      setRoomId(normalizedRoom);

      // Initialize with JavaScript template for first load.
      setCode(languageTemplates.javascript);
      previousTemplateRef.current = languageTemplates.javascript;

      socket.off('connect', emitJoin);
      socket.off('join-error', handleJoinError);
    };

    const handleJoinError = ({ message }) => {
      window.clearTimeout(joinTimeout);
      setJoinError(message || 'Failed to join room.');
      socket.off('connect', emitJoin);
      socket.off('join-success', handleJoinSuccess);
      socket.off('join-error', handleJoinError);
    };

    const joinTimeout = window.setTimeout(() => {
      handleJoinError({ message: 'Unable to connect to realtime server.' });
    }, 7000);

    socket.once('join-success', handleJoinSuccess);
    socket.once('join-error', handleJoinError);

    if (socket.connected) {
      emitJoin();
      return;
    }

    socket.connect();
    socket.once('connect', emitJoin);
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

    const handleRemoteCursorChange = ({ user, position, selection }) => {
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
    socket.on('cursor-change', handleRemoteCursorChange);
    socket.on('presence-snapshot', handlePresenceSnapshot);
    socket.on('cursor-remove', handleCursorRemove);
    socket.on('compile-status', handleCompileStatus);
    socket.on('compile-output', handleCompileOutput);

    return () => {
      socket.off('document-change', handleDocumentChange);
      socket.off('room-users', handleRoomUsers);
      socket.off('cursor-change', handleRemoteCursorChange);
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

  useEffect(() => {
    const clampIoPanelHeight = (value) => {
      if (!contentRef.current) {
        return value;
      }

      const totalHeight = contentRef.current.clientHeight;
      const maxIoHeight = Math.max(
        MIN_SECTION_HEIGHT,
        totalHeight - MIN_SECTION_HEIGHT - SPLITTER_HEIGHT
      );

      return Math.min(maxIoHeight, Math.max(MIN_SECTION_HEIGHT, value));
    };

    const handleMouseMove = (event) => {
      if (!isDraggingSplitterRef.current) {
        return;
      }

      const deltaY = event.clientY - dragStartYRef.current;
      const nextIoHeight = dragStartIoHeightRef.current - deltaY;
      setIoPanelHeight(clampIoPanelHeight(Math.round(nextIoHeight)));
    };

    const stopDragging = () => {
      isDraggingSplitterRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const handleWindowResize = () => {
      setIoPanelHeight((prev) => clampIoPanelHeight(prev));
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          setIoPanelHeight((prev) => clampIoPanelHeight(prev));
        })
      : null;

    if (resizeObserver && contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopDragging);
    window.addEventListener('resize', handleWindowResize);

    handleWindowResize();

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('resize', handleWindowResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
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

  const emitCursorChange = ({ position, selection }) => {
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

    if (!window.confirm(`Are you sure you want to delete ${idToDelete} from MongoDB?`)) {
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
    return (
      <JoinModal
        onJoin={handleJoinRoom}
        externalError={joinError}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
      />
    );
  }

  return (
    <div className="flex h-[100svh] min-h-[100svh] w-full overflow-hidden bg-app-bg text-app-text">
      <Sidebar />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        />

        <div ref={contentRef} className="relative flex-1 min-h-0 p-1.5 sm:p-4">
          <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
            <div className="min-h-[80px] flex-1 overflow-hidden rounded-xl border border-app-border bg-app-bg shadow-panel">
              <EditorPane
                value={code}
                onChange={handleCodeChange}
                onCursorChange={emitCursorChange}
                remoteCursors={Object.values(remoteCursors)}
                localUserId={localUserId}
                language={language}
                theme={theme}
              />
            </div>

            <div
              role="separator"
              aria-label="Resize input output panel"
              onMouseDown={(event) => {
                event.preventDefault();
                isDraggingSplitterRef.current = true;
                dragStartYRef.current = event.clientY;
                dragStartIoHeightRef.current = ioPanelHeight;
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
              }}
              className="group relative z-10 h-[5px] shrink-0 cursor-row-resize bg-app-muted"
            >
              <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-app-border transition-colors group-hover:bg-cyan-400/80" />
            </div>

            <div
              style={{ height: `${ioPanelHeight}px` }}
              className="min-h-[80px] shrink-0 overflow-y-auto overflow-x-hidden rounded-xl border border-app-border bg-app-bg p-2 shadow-panel sm:p-3"
            >
              <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-2 md:grid-cols-[260px_minmax(0,1fr)] md:grid-rows-1 sm:gap-3">
                <div className="flex min-h-0 flex-col gap-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-app-subtle">Input</div>
                  <textarea
                    value={compileInput}
                    onChange={(event) => setCompileInput(event.target.value)}
                    placeholder="stdin input..."
                    className="min-h-0 flex-1 w-full resize-none overflow-auto rounded-md border border-app-border bg-app-muted p-2 text-xs text-app-text outline-none focus:border-cyan-500"
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
                  <div className="min-h-0 flex-1 overflow-auto rounded-md border border-app-border bg-app-bg p-2 font-mono text-xs text-emerald-300">
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
        </div>
      </main>
    </div>
  );
}
