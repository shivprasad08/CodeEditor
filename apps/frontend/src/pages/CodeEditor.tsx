import React, { useState, useEffect, useRef } from "react";
import MonacoEditor from '@monaco-editor/react';
import { userAtom } from "../atoms/userAtom";
import { useRecoilState } from "recoil";
import { AiOutlineLoading3Quarters } from "react-icons/ai"; // Import spinner icon
import { socketAtom } from "../atoms/socketAtom";
import { useNavigate, useParams } from "react-router-dom";
import { connectedUsersAtom } from "../atoms/connectedUsersAtom";
import { IP_ADDRESS } from "../Globle";

type RemotePresence = {
  userId: string;
  name: string;
  color: string;
  position: {
    x: number;
    y: number;
  };
  selection: {
    start: number;
    end: number;
  };
  lastSeen: number;
};

const toRgba = (hexColor: string, alpha: number) => {
  const hex = hexColor.replace("#", "");
  const parsed =
    hex.length === 3
      ? hex
          .split("")
          .map((value) => value + value)
          .join("")
      : hex;

  const red = parseInt(parsed.substring(0, 2), 16);
  const green = parseInt(parsed.substring(2, 4), 16);
  const blue = parseInt(parsed.substring(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const toCssSafeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

const CodeEditor: React.FC = () => {
  const [code, setCode] = useState<any>("// Write your code here...");
  const [language, setLanguage] = useState("javascript");
  const [output, setOutput] = useState<string[]>([]); // Output logs
  const [socket, setSocket] = useRecoilState<WebSocket | null>(socketAtom);
  const [isLoading, setIsLoading] = useState(false); // Loading state
  const [currentButtonState, setCurrentButtonState] = useState("Submit Code");
  const [input, setInput] = useState<string>(""); // Input for code
  const [user, setUser] = useRecoilState(userAtom);
  const [remotePresenceMap, setRemotePresenceMap] = useState<Record<string, RemotePresence>>({});
  const [now, setNow] = useState(Date.now());

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationIdsRef = useRef<Record<string, string[]>>({});
  const selectionStyleRef = useRef<Record<string, HTMLStyleElement>>({});
  const latestPresenceRef = useRef<Record<string, RemotePresence>>({});
  const navigate = useNavigate();



  // multipleyer state
  const [connectedUsers, setConnectedUsers] = useRecoilState<any[]>(connectedUsersAtom);
  const parms = useParams();

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 400);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  // WebSocket connection logic
  useEffect(() => {

    if (!socket) {
      navigate("/" + parms.roomId);
    }
    else {
      // request to get all users on start
      socket.send(
        JSON.stringify({
          type: "requestToGetUsers",
          userId: user.id
        })
      );


      // request to get all data on start
      socket.send(
        JSON.stringify({
          type: "requestForAllData",
        })
      );
      socket.onclose = () => {
        console.log("Connection closed");
        setUser({
          id: "",
          name: "",
          roomId: "",
        })
        setSocket(null);
      }
    }
    return () => {
      socket?.close();
    };
  }, []);


  useEffect(() => {
    if (!socket) {
      navigate("/" + parms.roomId);
    }
    else {
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // on change of user
        if (data.type === "users") {
          setConnectedUsers(data.users);
          setRemotePresenceMap((previousMap) => {
            const validIds = new Set((data.users || []).map((connectedUser: any) => connectedUser.id));
            const nextMap: Record<string, RemotePresence> = {};

            Object.keys(previousMap).forEach((key) => {
              if (validIds.has(key)) {
                nextMap[key] = previousMap[key];
              }
            });

            latestPresenceRef.current = nextMap;
            return nextMap;
          });
        }
        // on change of code
        if (data.type === "code") {
          setCode(data.code);
        }

        // on change of input
        if (data.type === "input") {
          setInput(data.input);
        }

        // on change of language
        if (data.type === "language") {
          setLanguage(data.language);
        }

        // on change of Submit Button Status
        if (data.type === "submitBtnStatus") {
          setCurrentButtonState(data.value);
          setIsLoading(data.isLoading);
        }

        // on change of output
        if (data.type === "output") {
          setOutput((prevOutput) => [...prevOutput, data.message]);
          handleButtonStatus("Submit Code", false);
        }

        if (data.type === "presenceUpdate") {
          if (data.userId === user.id) {
            return;
          }

          setRemotePresenceMap((previousMap) => {
            const nextMap = {
              ...previousMap,
              [data.userId]: {
                userId: data.userId,
                name: data.name,
                color: data.color,
                position: data.position,
                selection: data.selection,
                lastSeen: Date.now(),
              },
            };
            latestPresenceRef.current = nextMap;
            return nextMap;
          });
        }

        if (data.type === "presenceSnapshot") {
          const snapshotEntries = (data.users || []).map((presence: any) => [
            presence.userId,
            {
              userId: presence.userId,
              name: presence.name,
              color: presence.color,
              position: presence.position,
              selection: presence.selection,
              lastSeen: Date.now(),
            },
          ]);

          setRemotePresenceMap((previousMap) => {
            const nextMap = {
              ...previousMap,
              ...Object.fromEntries(snapshotEntries),
            };
            latestPresenceRef.current = nextMap;
            return nextMap;
          });
        }

        if (data.type === "presenceRemove") {
          setRemotePresenceMap((previousMap) => {
            const nextMap = { ...previousMap };
            delete nextMap[data.userId];
            latestPresenceRef.current = nextMap;
            return nextMap;
          });
        }

        // send all data to new user on join  
        if (data.type === "requestForAllData") {
          socket?.send(
            JSON.stringify({
              type: "allData",
              code: code,
              input: input,
              language: language,
              currentButtonState: currentButtonState,
              isLoading: isLoading,
              userId: data.userId
            })
          );
        }

        // on receive all data
        if (data.type === "allData") {
          setCode(data.code);
          setInput(data.input);
          setLanguage(data.language);
          setCurrentButtonState(data.currentButtonState);
          setIsLoading(data.isLoading);
        }

      };
    }
  }, [code, input, language, currentButtonState, isLoading]);

  const getSelectionClassName = (userId: string, color: string) => {
    const className = `remote-selection-${toCssSafeId(userId)}`;

    if (!selectionStyleRef.current[className]) {
      const styleElement = document.createElement("style");
      styleElement.innerHTML = `
        .${className} {
          background-color: ${toRgba(color, 0.25)};
          border-bottom: 1px solid ${toRgba(color, 0.8)};
        }
      `;
      document.head.appendChild(styleElement);
      selectionStyleRef.current[className] = styleElement;
    }

    return className;
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel?.();

    if (!editor || !monaco || !model) {
      return;
    }

    const activeIds = new Set<string>();

    Object.values(remotePresenceMap).forEach((presence) => {
      if (presence.userId === user.id || !presence.selection) {
        return;
      }

      const startOffset = Math.max(0, Math.min(presence.selection.start, model.getValueLength()));
      const endOffset = Math.max(0, Math.min(presence.selection.end, model.getValueLength()));

      if (startOffset === endOffset) {
        if (decorationIdsRef.current[presence.userId]?.length) {
          decorationIdsRef.current[presence.userId] = editor.deltaDecorations(
            decorationIdsRef.current[presence.userId],
            []
          );
        }
        return;
      }

      const startPosition = model.getPositionAt(Math.min(startOffset, endOffset));
      const endPosition = model.getPositionAt(Math.max(startOffset, endOffset));
      const className = getSelectionClassName(presence.userId, presence.color);

      const decorations = [
        {
          range: new monaco.Range(
            startPosition.lineNumber,
            startPosition.column,
            endPosition.lineNumber,
            endPosition.column
          ),
          options: {
            className,
            isWholeLine: false,
          },
        },
      ];

      decorationIdsRef.current[presence.userId] = editor.deltaDecorations(
        decorationIdsRef.current[presence.userId] || [],
        decorations
      );
      activeIds.add(presence.userId);
    });

    Object.keys(decorationIdsRef.current).forEach((presenceUserId) => {
      if (!activeIds.has(presenceUserId)) {
        decorationIdsRef.current[presenceUserId] = editor.deltaDecorations(
          decorationIdsRef.current[presenceUserId],
          []
        );
        delete decorationIdsRef.current[presenceUserId];
      }
    });
  }, [remotePresenceMap, code, user.id]);

  useEffect(() => {
    return () => {
      const editor = editorRef.current;

      if (editor) {
        Object.keys(decorationIdsRef.current).forEach((presenceUserId) => {
          decorationIdsRef.current[presenceUserId] = editor.deltaDecorations(
            decorationIdsRef.current[presenceUserId],
            []
          );
        });
      }

      Object.values(selectionStyleRef.current).forEach((styleElement) => {
        styleElement.remove();
      });
    };
  }, []);

  const handleSubmit = async () => {
    handleButtonStatus("Submitting...", true);
    const submission = {
      code,
      language,
      roomId: user.roomId,
      input
    };

    socket?.send(user?.id ? user.id : "");

    const res = await fetch(`http://${IP_ADDRESS}:3000/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(submission),
    });

    handleButtonStatus("Compiling...", true);

    if (!res.ok) {
      setOutput((prevOutput) => [
        ...prevOutput,
        "Error submitting code. Please try again.",
      ]);
      handleButtonStatus("Submit Code", false);
    }
  };

  // handle input change multiple user
  const handleInputChange = (e: any) => {
    setInput(e.target.value);
    socket?.send(
      JSON.stringify({
        type: "input",
        input: e.target.value,
        roomId: user.roomId
      })
    );
  }

  // handle language change multiple user
  const handleLanguageChange = (value: any) => {
    setLanguage(value);
    socket?.send(
      JSON.stringify({
        type: "language",
        language: value,
        roomId: user.roomId
      })
    );
  }

  // handle submit button status multiple user
  const handleButtonStatus = (value: any, isLoading: any) => {
    setCurrentButtonState(value);
    setIsLoading(isLoading);
    socket?.send(
      JSON.stringify({
        type: "submitBtnStatus",
        value: value,
        isLoading: isLoading,
        roomId: user.roomId
      })
    );
  }

  const handleEditorDidMount = (editor: any, monaco: any) => {
    console.log("editor", editor);
    console.log("monaco", monaco);

    monaco.editor.defineTheme("neon-collab", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "", foreground: "d4d4d4", background: "1e1e1e" },
        { token: "keyword", foreground: "569cd6" },
        { token: "string", foreground: "ce9178" },
        { token: "comment", foreground: "6a9955" },
        { token: "number", foreground: "b5cea8" },
        { token: "type", foreground: "4ec9b0" },
        { token: "type.identifier", foreground: "4ec9b0" },
        { token: "function", foreground: "dcdcaa" },
        { token: "identifier.function", foreground: "dcdcaa" },
      ],
      colors: {
        "editor.background": "#1e1e1e",
        "editor.foreground": "#d4d4d4",
        "editorCursor.foreground": "#d4d4d4",
        "editorLineNumber.foreground": "#858585",
        "editorLineNumber.activeForeground": "#c6c6c6",
        "editor.selectionBackground": "#264f78",
        "editor.inactiveSelectionBackground": "#3a3d41",
        "editorIndentGuide.background1": "#404040",
        "editorIndentGuide.activeBackground1": "#707070",
      },
    });
    monaco.editor.setTheme("neon-collab");

    editorRef.current = editor;
    monacoRef.current = monaco;

    const publishPresence = () => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }

      const currentEditor = editorRef.current;
      const model = currentEditor?.getModel?.();

      if (!currentEditor || !model) {
        return;
      }

      const position = currentEditor.getPosition();
      const selection = currentEditor.getSelection();

      if (!position || !selection) {
        return;
      }

      const visiblePosition = currentEditor.getScrolledVisiblePosition(position);

      if (!visiblePosition) {
        return;
      }

      const payload = {
        type: "cursorPresence",
        roomId: user.roomId,
        position: {
          x: visiblePosition.left,
          y: visiblePosition.top + visiblePosition.height,
        },
        selection: {
          start: model.getOffsetAt(selection.getStartPosition()),
          end: model.getOffsetAt(selection.getEndPosition()),
        },
      };

      socket.send(JSON.stringify(payload));
    };

    if (editor) {
      editor.onDidChangeCursorPosition(() => {
        publishPresence();
      });

      editor.onDidChangeCursorSelection(() => {
        publishPresence();
      });

      // handle code change multiple user
      editor.onDidChangeModelContent(() => {
        console.log("Code Updated:", editor.getValue());
        setCode(editor.getValue());
        socket?.send(
          JSON.stringify({
            type: "code",
            code: editor.getValue(),
            roomId: user.roomId
          })
        );

        publishPresence();
      });

      editor.onDidScrollChange(() => {
        publishPresence();
      });

      publishPresence();
    }
  };

  const selectedFileName =
    language === "cpp"
      ? "main.cpp"
      : language === "python"
      ? "main.py"
      : language === "java"
      ? "Main.java"
      : language === "rust"
      ? "main.rs"
      : language === "go"
      ? "main.go"
      : "main.js";

  return (
    <div
      className="min-h-screen bg-[#1e1e1e] text-[#d4d4d4]"
      style={{ fontFamily: "Consolas, 'Courier New', monospace" }}
    >
      <div className="h-screen flex overflow-hidden">
        <aside className="w-[260px] bg-[#252526] border-r border-[#3c3c3c] flex flex-col">
          <div className="px-3 py-2 text-xs tracking-wide text-[#d4d4d4] border-b border-[#3c3c3c]">
            EXPLORER
          </div>

          <div className="px-2 py-2 border-b border-[#3c3c3c]">
            <div className="text-xs text-[#d4d4d4]/80 mb-2">FILES</div>
            <div className="bg-[#2d2d2d] border-l-2 border-[#007acc] px-2 py-1 text-sm text-[#d4d4d4]">
              {selectedFileName}
            </div>
          </div>

          <div className="px-2 py-2 flex-1 overflow-y-auto">
            <div className="text-xs text-[#d4d4d4]/80 mb-2">USERS</div>
            <div className="space-y-2">
              {connectedUsers.length > 0 ? (
                connectedUsers.map((user: any, index: any) => (
                  <div key={index} className="flex items-center gap-2 px-1 py-1">
                    <div
                      className="text-white rounded-full w-7 h-7 flex items-center justify-center text-xs"
                      style={{ backgroundColor: user.color || "#3B82F6" }}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-[#d4d4d4] truncate">{user.name}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#d4d4d4]/60">No user connected yet.</p>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0">
          <div className="h-11 bg-[#2d2d2d] border-b border-[#3c3c3c] flex items-end justify-between">
            <div className="h-full flex items-end">
              <div className="h-full px-4 flex items-center text-sm text-[#d4d4d4] border-t-2 border-[#007acc] bg-[#1e1e1e]">
                {selectedFileName}
              </div>
            </div>

            <div className="h-full flex items-center gap-2 px-3">
              <div className="text-right mr-2">
                <p className="text-xs text-[#d4d4d4]/80">Invitation Code</p>
                {user.roomId.length > 0 ? (
                  <p className="text-sm text-[#d4d4d4]">{user.roomId}</p>
                ) : (
                  <p className="text-sm text-[#d4d4d4]/60">-</p>
                )}
              </div>

              <button
                onClick={handleSubmit}
                className={`px-3 py-1.5 text-sm rounded bg-[#0e639c] text-[#d4d4d4] hover:brightness-110 ${
                  isLoading ? "opacity-50 cursor-not-allowed" : ""
                }`}
                disabled={isLoading}
              >
                <span className="flex items-center space-x-2">
                  {isLoading && <AiOutlineLoading3Quarters className="animate-spin" />}
                  <span>{currentButtonState}</span>
                </span>
              </button>

              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="h-8 text-sm bg-[#3c3c3c] text-[#d4d4d4] px-2 rounded border border-[#3c3c3c] focus:outline-none"
              >
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="cpp">C++</option>
                <option value="java">Java</option>
                <option value="rust">Rust</option>
                <option value="go">Go</option>
              </select>
            </div>
          </div>

          <div className="relative flex-1 min-h-0 border-b border-[#3c3c3c]">
            <MonacoEditor
              value={code}
              language={language}
              theme="neon-collab"
              className="h-full"
              onMount={handleEditorDidMount}
              options={{
                fontFamily: "Consolas, 'Courier New', monospace",
                fontSize: 14,
                minimap: { enabled: false },
              }}
            />

            <div className="pointer-events-none absolute inset-0 z-20">
              {Object.values(remotePresenceMap)
                .filter((presence) => presence.userId !== user.id && presence.position)
                .map((presence) => {
                  const idleTime = now - presence.lastSeen;
                  const maxIdle = 3000;
                  const opacity = Math.max(0, 1 - idleTime / maxIdle);

                  return (
                    <div
                      key={presence.userId}
                      className="absolute transition-all duration-150 ease-linear"
                      style={{
                        transform: `translate(${presence.position.x}px, ${presence.position.y}px)`,
                        opacity,
                      }}
                    >
                      <div
                        className="absolute -top-7 left-2 px-2 py-1 rounded text-[11px] font-semibold whitespace-nowrap"
                        style={{
                          backgroundColor: toRgba(presence.color, 0.95),
                          color: "#111111",
                        }}
                      >
                        {presence.name}
                      </div>
                      <div
                        className="w-3 h-3 rotate-45 border-2 rounded-sm"
                        style={{
                          borderColor: presence.color,
                          backgroundColor: "#1e1e1e",
                        }}
                      />
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="h-56 bg-[#252526] border-t border-[#3c3c3c] flex flex-col">
            <div className="h-9 bg-[#2d2d2d] border-b border-[#3c3c3c] flex items-center px-3 text-sm text-[#d4d4d4]">
              PANEL
            </div>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 min-h-0">
              <div className="flex flex-col min-h-0">
                <h2 className="text-sm text-[#d4d4d4] mb-2">Input</h2>
                <textarea
                  value={input}
                  onChange={(e) => handleInputChange(e)}
                  placeholder={`Enter input for your code like... \n5 \n10`}
                  className="flex-1 min-h-0 bg-[#3c3c3c] text-[#d4d4d4] w-full p-3 border border-[#3c3c3c] focus:outline-none"
                />
              </div>

              <div className="flex flex-col min-h-0">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="text-sm text-[#d4d4d4]">Output</h2>
                  <button onClick={() => setOutput([])} className="text-sm text-[#d4d4d4] hover:text-[#ffffff]">
                    Clear
                  </button>
                </div>

                <div className="flex-1 min-h-0 bg-[#3c3c3c] text-[#d4d4d4] p-3 border border-[#3c3c3c] overflow-y-auto space-y-2 text-sm">
                  {output.length > 0 ? (
                    output.map((line, index) => (
                      <pre key={index} className="whitespace-pre-wrap">
                        {line}
                      </pre>
                    ))
                  ) : (
                    <p className="text-[#d4d4d4]/60">No output yet. Submit your code to see results.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default CodeEditor;
