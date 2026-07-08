/**
 * Monaco Editor custom theme: "pirate-dark"
 *
 * Color system derived from the Akumen pirate logo:
 * - Background: very dark navy (#090720)
 * - Keywords: lime/neon green (#39FF14) — the bandana accent
 * - Strings: warm gold (#FFD700)
 * - Functions: white (#E8E6F0)
 * - Variables: silver (#C0C0C0)
 * - Comments: gray-blue (#6B7394)
 */

import type { editor } from 'monaco-editor';

export const PIRATE_THEME_NAME = 'pirate-dark';

export const pirateDarkTheme: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    // Keywords — lime green (bandana color)
    { token: 'keyword', foreground: '39FF14', fontStyle: 'bold' },
    { token: 'keyword.control', foreground: '39FF14' },
    { token: 'keyword.operator', foreground: '39FF14' },

    // Strings — warm gold
    { token: 'string', foreground: 'FFD700' },
    { token: 'string.escape', foreground: 'E6C200' },

    // Functions — white
    { token: 'entity.name.function', foreground: 'E8E6F0' },
    { token: 'support.function', foreground: 'E8E6F0' },
    { token: 'meta.function-call', foreground: 'E8E6F0' },

    // Variables — silver
    { token: 'variable', foreground: 'C0C0C0' },
    { token: 'variable.predefined', foreground: 'A0A0B0' },
    { token: 'variable.parameter', foreground: 'B8B8C8' },

    // Comments — gray-blue
    { token: 'comment', foreground: '6B7394', fontStyle: 'italic' },
    { token: 'comment.line', foreground: '6B7394', fontStyle: 'italic' },
    { token: 'comment.block', foreground: '6B7394', fontStyle: 'italic' },

    // Numbers — lime
    { token: 'number', foreground: '39FF14' },
    { token: 'number.float', foreground: '39FF14' },
    { token: 'number.hex', foreground: '39FF14' },

    // Types — accent blue (from logo)
    { token: 'type', foreground: '47BFFF' },
    { token: 'type.identifier', foreground: '47BFFF' },
    { token: 'support.type', foreground: '47BFFF' },

    // Operators
    { token: 'operator', foreground: '8B8999' },
    { token: 'delimiter', foreground: '8B8999' },
    { token: 'delimiter.bracket', foreground: 'A0A0B0' },

    // Constants
    { token: 'constant', foreground: '47BFFF' },
    { token: 'constant.language', foreground: '47BFFF' },

    // Tags (for any embedded HTML/XML)
    { token: 'tag', foreground: '39FF14' },
    { token: 'attribute.name', foreground: 'C0C0C0' },
    { token: 'attribute.value', foreground: 'FFD700' },

    // Default text
    { token: '', foreground: 'E8E6F0' },
  ],
  colors: {
    // Editor background — very dark navy
    'editor.background': '#090720',
    'editor.foreground': '#E8E6F0',

    // Cursor — lime green
    'editorCursor.foreground': '#39FF14',

    // Selection
    'editor.selectionBackground': '#1E1A45',
    'editor.inactiveSelectionBackground': '#15123A',
    'editor.selectionHighlightBackground': '#1A1840',

    // Line highlight
    'editor.lineHighlightBackground': '#0D0A30',
    'editor.lineHighlightBorder': '#1A1845',

    // Line numbers
    'editorLineNumber.foreground': '#3D3B5C',
    'editorLineNumber.activeForeground': '#6B7394',

    // Indentation guides
    'editorIndentGuide.background': '#1A1840',
    'editorIndentGuide.activeBackground': '#2A2860',

    // Gutter
    'editorGutter.background': '#090720',

    // Scrollbar
    'scrollbarSlider.background': '#1A184580',
    'scrollbarSlider.hoverBackground': '#2A286080',
    'scrollbarSlider.activeBackground': '#39FF1440',

    // Widget (autocomplete popup, etc.)
    'editorWidget.background': '#0D0A2E',
    'editorWidget.border': '#1A1845',

    // Bracket matching
    'editorBracketMatch.background': '#39FF1420',
    'editorBracketMatch.border': '#39FF1460',

    // Find match
    'editor.findMatchBackground': '#FFD70040',
    'editor.findMatchHighlightBackground': '#FFD70020',

    // Minimap (disabled but just in case)
    'minimap.background': '#090720',
  },
};
