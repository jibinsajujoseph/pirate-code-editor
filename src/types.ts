/**
 * Core types for the Akumen Code platform.
 * Phase 1: file management, editor state, output.
 */

/** Represents a single file in the workspace */
export interface WorkspaceFile {
  id: string;
  name: string;
  content: string;
  language: SupportedLanguage;
}

/** Output entry from a code execution run */
export interface OutputEntry {
  type: 'stdout' | 'stderr' | 'info' | 'error';
  text: string;
  timestamp: number;
}

/** Supported language extensions and their Monaco language IDs */
export type SupportedLanguage = 'python' | 'javascript';

export const EXTENSION_LANGUAGE_MAP: Record<string, SupportedLanguage> = {
  '.py': 'python',
  '.js': 'javascript',
};

/** Derive the Monaco language from a filename */
export function getLanguageFromFilename(filename: string): SupportedLanguage | null {
  const ext = filename.substring(filename.lastIndexOf('.'));
  return EXTENSION_LANGUAGE_MAP[ext] ?? null;
}

/** Validate that a workspace filename maps to a supported runtime. */
export function validateWorkspaceFilename(filename: string): string | null {
  const trimmed = filename.trim();
  if (!trimmed) {
    return 'File names cannot be empty.';
  }

  if (trimmed.startsWith('.') || trimmed.includes('/') || trimmed.includes('\\')) {
    return 'Use a plain filename like main.py or app.js.';
  }

  if (!getLanguageFromFilename(trimmed)) {
    return 'Only .py and .js files are supported in Phase 4.';
  }

  return null;
}

/** Generate a unique ID */
export function generateId(): string {
  return crypto.randomUUID();
}
