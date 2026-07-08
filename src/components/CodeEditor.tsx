import Editor, { loader } from '@monaco-editor/react';
import type { Monaco, OnMount } from '@monaco-editor/react';
import * as monacoEditor from 'monaco-editor';
import type { WorkspaceFile } from '../types';
import { PIRATE_THEME_NAME, pirateDarkTheme } from '../pirate-theme';

loader.config({ monaco: monacoEditor });

interface CodeEditorProps {
  file: WorkspaceFile | null;
  onContentChange: (fileId: string, content: string) => void;
  readOnly?: boolean;
  onKeyDown?: () => void;
}

const BLOCKED_EDITOR_EVENTS = [
  'copy',
  'cut',
  'paste',
  'contextmenu',
  'dragstart',
  'drop',
] as const;

function stopBlockedEditorEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

function isBlockedClipboardShortcut(event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey)) {
    return false;
  }

  const key = event.key.toLowerCase();
  return key === 'c' || key === 'v' || key === 'x';
}

/**
 * CodeEditor — Monaco editor pane with pirate-dark custom theme.
 *
 * Phase 5: standard clipboard/context menu/drag-drop vectors are blocked and
 * editor assistance is disabled. This is deterrence, not airtight security:
 * screenshots, OCR, manual retyping, extensions, or DevTools can still bypass it.
 *
 * Failure mode decision: if Monaco fails to bootstrap, we do not fall back to a
 * plain editable textarea. The editor remains unavailable until the page is reloaded,
 * so we avoid silently re-enabling paste in an unguarded backup editor surface.
 */
export default function CodeEditor({
  file,
  onContentChange,
  readOnly = false,
  onKeyDown,
}: CodeEditorProps) {
  const handleEditorMount: OnMount = (editor, monaco) => {
    const domNode = editor.getDomNode();
    if (!domNode) {
      return;
    }

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => null);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => null);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX, () => null);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => null);

    for (const eventName of BLOCKED_EDITOR_EVENTS) {
      domNode.addEventListener(eventName, stopBlockedEditorEvent, true);
    }

    const keydownHandler = (event: KeyboardEvent) => {
      if (isBlockedClipboardShortcut(event)) {
        stopBlockedEditorEvent(event);
        return;
      }

      // Trigger typing sound callback
      onKeyDown?.();
    };

    domNode.addEventListener('keydown', keydownHandler, true);

    editor.onDidDispose(() => {
      for (const eventName of BLOCKED_EDITOR_EVENTS) {
        domNode.removeEventListener(eventName, stopBlockedEditorEvent, true);
      }
      domNode.removeEventListener('keydown', keydownHandler, true);
    });
  };

  const handleBeforeMount = (monaco: Monaco) => {
    // Register the pirate-dark custom theme
    monaco.editor.defineTheme(PIRATE_THEME_NAME, pirateDarkTheme);

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      allowNonTsExtensions: true,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true,
    });
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true,
    });
  };

  if (!file) {
    return (
      <div className="editor-empty">
        <p className="editor-empty-message">Select or create a file to start editing</p>
      </div>
    );
  }

  return (
    <div className="editor-container">
      <div className="editor-tab-bar">
        <span className="editor-tab editor-tab--active">{file.name}</span>
      </div>
      <div className="editor-monaco-wrapper">
        <Editor
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          loading={<p className="editor-empty-message">Loading secured editor…</p>}
          theme={PIRATE_THEME_NAME}
          language={file.language}
          path={file.name}
          value={file.content}
          onChange={(value) => {
            if (value !== undefined) {
              onContentChange(file.id, value);
            }
          }}
          options={{
            readOnly,
            domReadOnly: readOnly,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Menlo', 'Consolas', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            insertSpaces: true,
            wordWrap: 'on',
            contextmenu: false,
            dragAndDrop: false,
            copyWithSyntaxHighlighting: false,
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            parameterHints: { enabled: false },
            wordBasedSuggestions: 'off',
            inlineSuggest: { enabled: false },
            hover: { enabled: false },
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            renderLineHighlight: 'line',
            renderWhitespace: 'none',
          }}
        />
      </div>
    </div>
  );
}
