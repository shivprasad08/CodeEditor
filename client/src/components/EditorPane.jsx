import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import { languageTemplates } from '../lib/languageTemplates';

const defaultCode = languageTemplates.javascript;

const injectedStyles = new Set();

function sanitizeId(id = '') {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function ensureUserCursorStyle(user) {
  const safeId = sanitizeId(user.id);
  const styleId = `remote-cursor-${safeId}`;

  if (injectedStyles.has(styleId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .remote-caret-${safeId} {
      border-left: 2px solid ${user.color};
      margin-left: -1px;
      height: 1.3em;
    }

    .remote-label-${safeId} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      margin-left: 5px;
      margin-top: -16px;
      background: ${user.color};
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      position: relative;
      border-radius: 9999px;
      box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.2);
      pointer-events: none;
      z-index: 5;
    }

    .remote-label-${safeId}::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 100%;
      width: 0;
      height: 0;
      margin-left: -3px;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 5px solid ${user.color};
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.28));
    }
  `;

  document.head.appendChild(style);
  injectedStyles.add(styleId);
}

export default function EditorPane({ value, onChange, onCursorChange, remoteCursors = [], localUserId, language = 'javascript' }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationIdsRef = useRef([]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) {
      return;
    }

    const monaco = monacoRef.current;
    const decorations = remoteCursors
      .filter((cursor) => {
        if (!cursor?.user?.id || !cursor?.position || !localUserId) {
          return false;
        }
        // Double-check: never render local user's cursor
        return cursor.user.id !== localUserId;
      })
      .map((cursor) => {
        ensureUserCursorStyle(cursor.user);
        const safeId = sanitizeId(cursor.user.id);

        return {
          range: new monaco.Range(
            cursor.position.lineNumber,
            cursor.position.column,
            cursor.position.lineNumber,
            cursor.position.column
          ),
          options: {
            beforeContentClassName: `remote-caret-${safeId}`,
            after: {
              contentText: cursor.user.initial || '?',
              inlineClassName: `remote-label-${safeId}`,
            },
          },
        };
      });

    decorationIdsRef.current = editorRef.current.deltaDecorations(decorationIdsRef.current, decorations);
  }, [remoteCursors, localUserId]);

  return (
    <section className="h-full w-full bg-slate-950">
      <Editor
        height="100%"
        language={language}
        value={value || defaultCode}
        onChange={(nextValue) => onChange(nextValue || '')}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          lineNumbersMinChars: 3,
          wordWrap: 'on',
          smoothScrolling: true,
          contextmenu: true,
          scrollBeyondLastLine: false,
          padding: { top: 14 },
          suggestOnTriggerCharacters: true,
          quickSuggestions: {
            other: true,
            comments: false,
            strings: false,
          },
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;

          editor.onDidChangeCursorPosition((event) => {
            onCursorChange(event.position);
          });
        }}
      />
    </section>
  );
}
