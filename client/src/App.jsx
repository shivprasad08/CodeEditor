import { useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import EditorPane from './components/EditorPane';
import JoinModal from './components/JoinModal';
import { socket } from './lib/socket';
import { languageTemplates } from './lib/languageTemplates';

export default function App() {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [code, setCode] = useState('');
  const [users, setUsers] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [localUserId, setLocalUserId] = useState('');
  const [joinError, setJoinError] = useState('');
  const [language, setLanguage] = useState('javascript');
  const isRemoteUpdate = useRef(false);
  const lastCursorEmitRef = useRef(0);
  const localUserIdRef = useRef('');
  const previousLanguageRef = useRef('javascript');
  const previousTemplateRef = useRef(languageTemplates.javascript);

  // Handle language changes - switch to new template if code hasn't been customized
  useEffect(() => {
    if (!code || code.trim() === previousTemplateRef.current.trim()) {
      // Code is empty or matches previous template, so show new template
      const newTemplate = languageTemplates[language] || languageTemplates.javascript;
      setCode(newTemplate);
      previousTemplateRef.current = newTemplate;
    }

    previousLanguageRef.current = language;
  }, [language]);

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
    if (!roomId || !userName) {
      return;
    }

    const handleDocumentChange = ({ content }) => {
      isRemoteUpdate.current = true;
      setCode(content || '');
    };

    const handleRoomUsers = ({ users: roomUsers }) => {
      setUsers(roomUsers || []);
      setRemoteCursors((prev) => {
        const validIds = new Set((roomUsers || []).map((user) => user.id));
        return Object.fromEntries(Object.entries(prev).filter(([userId]) => validIds.has(userId)));
      });
    };

    const handleCursorChange = ({ user, position, senderId }) => {
      if (!user?.id || !position) {
        return;
      }

      // Prevent adding local user's cursor to remote cursors
      if (user.id === localUserIdRef.current) {
        return;
      }

      setRemoteCursors((prev) => ({
        ...prev,
        [user.id]: { user, position },
      }));
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

    socket.on('document-change', handleDocumentChange);
    socket.on('room-users', handleRoomUsers);
    socket.on('cursor-change', handleCursorChange);
    socket.on('cursor-remove', handleCursorRemove);

    return () => {
      socket.off('document-change', handleDocumentChange);
      socket.off('room-users', handleRoomUsers);
      socket.off('cursor-change', handleCursorChange);
      socket.off('cursor-remove', handleCursorRemove);
    };
  }, [roomId, userName]);

  const handleCodeChange = (nextCode) => {
    setCode(nextCode);

    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    socket.emit('document-change', {
      roomId,
      content: nextCode,
    });
  };

  const handleCursorChange = (position) => {
    const now = Date.now();
    if (now - lastCursorEmitRef.current < 35) {
      return;
    }

    lastCursorEmitRef.current = now;

    socket.emit('cursor-change', {
      roomId,
      position,
    });
  };

  const handleInvite = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}?room=${roomId}`);
  };

  const handleExport = async () => {
    await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/save-to-cloud`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomId,
        content: code,
        fileName: `snippet-${Date.now()}.txt`,
      }),
    });
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
          language={language}
          onLanguageChange={setLanguage}
          onInvite={handleInvite} 
          onExport={handleExport} 
        />

        <div className="relative h-[calc(100vh-3rem)] flex-1 p-4">
          <div className="h-full w-full overflow-hidden rounded-xl border border-app-border bg-app-bg shadow-panel">
            <EditorPane
              value={code}
              onChange={handleCodeChange}
              onCursorChange={handleCursorChange}
              remoteCursors={Object.values(remoteCursors)}
              localUserId={localUserId}
              language={language}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
