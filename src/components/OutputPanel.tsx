import { useEffect, useRef } from 'react';
import type { OutputEntry } from '../types';

interface OutputPanelProps {
  entries: OutputEntry[];
  onClear: () => void;
}

/**
 * OutputPanel — the "Captain's Log" execution output display.
 * Shows stdout/stderr from code execution runs with pirate-themed labels.
 *
 * Phase 7 labels:
 *   - Title: "Captain's Log"
 *   - Error styling: "Mutiny Report"
 *   - Success (exit code 0): "Treasure Found"
 */
export default function OutputPanel({ entries, onClear }: OutputPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries appear
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="output-panel">
      <div className="output-panel-header">
        <h3 className="output-panel-title">📋 Captain&apos;s Log</h3>
        <button className="output-panel-clear-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="output-panel-body" ref={scrollRef}>
        {entries.length === 0 ? (
          <p className="output-panel-empty">Fire the cannons to see output here.</p>
        ) : (
          entries.map((entry, index) => (
            <pre
              key={index}
              className={`output-entry output-entry--${entry.type}`}
            >
              {entry.text}
            </pre>
          ))
        )}
      </div>
    </div>
  );
}
