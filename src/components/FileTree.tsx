import { useState, useRef, useEffect } from 'react';
import type { WorkspaceFile } from '../types';

interface FileTreeProps {
  files: WorkspaceFile[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onCreateFile: (name: string) => void;
  onRenameFile: (id: string, newName: string) => void;
  onDeleteFile: (id: string) => void;
  disabled?: boolean;
}

/** Return a file-type emoji based on extension. */
function fileIcon(filename: string): string {
  if (filename.endsWith('.py')) return '🐍';
  if (filename.endsWith('.js')) return '⚡';
  return '📄';
}

/**
 * FileTree — the "Ship's Manifest" workspace file explorer.
 * Supports create, rename, delete. Pirate-themed in Phase 7.
 */
export default function FileTree({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  disabled = false,
}: FileTreeProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the create input when it appears
  useEffect(() => {
    if (isCreating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [isCreating]);

  // Auto-focus the rename input when it appears
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
    }
  }, [renamingId]);

  const handleCreateSubmit = () => {
    const trimmed = newFileName.trim();
    if (trimmed) {
      onCreateFile(trimmed);
    }
    setNewFileName('');
    setIsCreating(false);
  };

  const handleRenameSubmit = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameFile(id, trimmed);
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const startRename = (file: WorkspaceFile) => {
    if (disabled) {
      return;
    }
    setRenamingId(file.id);
    setRenameValue(file.name);
  };

  return (
    <div className={`file-tree ${disabled ? 'file-tree--disabled' : ''}`}>
      <div className="file-tree-header">
        <h3 className="file-tree-title">📜 Ship&apos;s Manifest</h3>
        <button
          className="file-tree-add-btn"
          onClick={() => setIsCreating(true)}
          title="New file"
          disabled={disabled}
        >
          +
        </button>
      </div>

      <ul className="file-tree-list">
        {files.map((file) => (
          <li
            key={file.id}
            className={`file-tree-item ${file.id === activeFileId ? 'file-tree-item--active' : ''}`}
          >
            {renamingId === file.id ? (
              <input
                ref={renameInputRef}
                className="file-tree-rename-input"
                value={renameValue}
                disabled={disabled}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRenameSubmit(file.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit(file.id);
                  if (e.key === 'Escape') {
                    setRenamingId(null);
                    setRenameValue('');
                  }
                }}
              />
            ) : (
              <>
                <span className="file-tree-item-icon">{fileIcon(file.name)}</span>
                <button
                  className="file-tree-item-name"
                  onClick={() => onSelectFile(file.id)}
                  onDoubleClick={() => {
                    if (!disabled) {
                      startRename(file);
                    }
                  }}
                  title={`Click to open, double-click to rename: ${file.name}`}
                >
                  {file.name}
                </button>
                <div className="file-tree-item-actions">
                  <button
                    className="file-tree-action-btn"
                    onClick={() => startRename(file)}
                    title="Rename"
                    disabled={disabled}
                  >
                    ✎
                  </button>
                  <button
                    className="file-tree-action-btn file-tree-action-btn--delete"
                    onClick={() => onDeleteFile(file.id)}
                    title="Delete"
                    disabled={disabled}
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {isCreating && (
        <div className="file-tree-create">
          <input
            ref={createInputRef}
            className="file-tree-create-input"
            placeholder="filename.py"
            value={newFileName}
            disabled={disabled}
            onChange={(e) => setNewFileName(e.target.value)}
            onBlur={handleCreateSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSubmit();
              if (e.key === 'Escape') {
                setIsCreating(false);
                setNewFileName('');
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
