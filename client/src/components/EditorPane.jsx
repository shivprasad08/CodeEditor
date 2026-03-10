import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';

const injectedStyles = new Set();

function sanitizeId(id = '') {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function escapeCssContent(value = '') {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
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
      position: relative;
    }

    .remote-label-${safeId}::after {
      content: "${escapeCssContent((user.name || user.initial || 'User').slice(0, 24))}";
      position: absolute;
      left: 8px;
      top: -20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      max-width: 240px;
      padding: 4px 10px;
      background: ${user.color};
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      white-space: nowrap;
      line-height: 1;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
      pointer-events: none;
      z-index: 6;
    }
  `;

  document.head.appendChild(style);
  injectedStyles.add(styleId);
}

function toRgba(hexColor, alpha) {
  const raw = String(hexColor || '').replace('#', '');
  const normalized = raw.length === 3
    ? raw.split('').map((value) => `${value}${value}`).join('')
    : raw.padEnd(6, '0').slice(0, 6);

  const red = parseInt(normalized.substring(0, 2), 16);
  const green = parseInt(normalized.substring(2, 4), 16);
  const blue = parseInt(normalized.substring(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function ensureUserSelectionStyle(user) {
  const safeId = sanitizeId(user.id);
  const styleId = `remote-selection-${safeId}`;

  if (injectedStyles.has(styleId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .remote-selection-${safeId} {
      background-color: ${toRgba(user.color, 0.24)};
      border-bottom: 1px solid ${toRgba(user.color, 0.8)};
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
      .flatMap((cursor) => {
        ensureUserCursorStyle(cursor.user);
        ensureUserSelectionStyle(cursor.user);
        const safeId = sanitizeId(cursor.user.id);

        const items = [];

        if (cursor.selection && Number.isInteger(cursor.selection.start) && Number.isInteger(cursor.selection.end)) {
          const model = editorRef.current.getModel();
          const maxOffset = model.getValueLength();
          const startOffset = Math.max(0, Math.min(cursor.selection.start, maxOffset));
          const endOffset = Math.max(0, Math.min(cursor.selection.end, maxOffset));

          if (startOffset !== endOffset) {
            const from = model.getPositionAt(Math.min(startOffset, endOffset));
            const to = model.getPositionAt(Math.max(startOffset, endOffset));

            items.push({
              range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column),
              options: {
                className: `remote-selection-${safeId}`,
                isWholeLine: false,
              },
            });
          }
        }

        items.push({
          range: new monaco.Range(
            cursor.position.lineNumber,
            cursor.position.column,
            cursor.position.lineNumber,
            cursor.position.column
          ),
          options: {
            beforeContentClassName: `remote-caret-${safeId}`,
            afterContentClassName: `remote-label-${safeId}`,
          },
        });

        return items;
      });

    decorationIdsRef.current = editorRef.current.deltaDecorations(decorationIdsRef.current, decorations);
  }, [remoteCursors, localUserId]);

  return (
    <section className="h-full w-full bg-slate-950">
      <Editor
        height="100%"
        language={language}
        value={value ?? ''}
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

          const emitPresence = () => {
            const model = editor.getModel();
            const position = editor.getPosition();
            const selection = editor.getSelection();

            if (!model || !position || !selection) {
              return;
            }

            onCursorChange({
              position,
              selection: {
                start: model.getOffsetAt(selection.getStartPosition()),
                end: model.getOffsetAt(selection.getEndPosition()),
              },
            });
          };

          editor.onDidChangeCursorPosition((event) => {
            emitPresence();
          });

          editor.onDidChangeCursorSelection(() => {
            emitPresence();
          });

          emitPresence();
        }}
      />
    </section>
  );
}
