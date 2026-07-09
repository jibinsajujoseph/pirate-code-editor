import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CodeEditor from './components/CodeEditor';
import FileTree from './components/FileTree';
import OutputPanel from './components/OutputPanel';
import Toolbar from './components/Toolbar';
import SetSailScreen from './components/SetSailScreen';
import ParticleBackground from './components/ParticleBackground';
import { audioEngine } from './audio-engine';
import {
  generateId,
  getLanguageFromFilename,
  validateWorkspaceFilename,
} from './types';
import type { OutputEntry, WorkspaceFile } from './types';

const DEFAULT_FILE: WorkspaceFile = {
  id: generateId(),
  name: 'main.py',
  content: '# Write your code here\nprint("Hello, world!")\n',
  language: 'python',
};

const BACKEND_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000';
const DEFAULT_WARNING_THRESHOLD_MINUTES = 5;
const SOCKET_RECONNECT_DELAY_MS = 1500;
const SOCKET_PING_INTERVAL_MS = 30_000;

type SessionCreateResponse = {
  session_id: string;
  expires_at: string;
  warning_threshold_minutes: number;
};

type SocketState = 'connecting' | 'ready' | 'reconnecting' | 'closed' | 'error';
type SessionStatus = 'active' | 'ended' | 'error';

type SessionStateMessage = {
  type: 'session_state';
  status: SessionStatus;
  expires_at: string;
  ended_at: string | null;
  ended_reason: string | null;
  warning_threshold_minutes: number;
};

type SessionEndedMessage = {
  type: 'session_ended';
  reason: string | null;
  message: string;
  ended_at: string;
  expires_at: string;
};

function formatTimeRemaining(expiresAtMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export default function App() {
  const [files, setFiles] = useState<WorkspaceFile[]>([DEFAULT_FILE]);
  const [activeFileId, setActiveFileId] = useState<string | null>(DEFAULT_FILE.id);
  const [outputEntries, setOutputEntries] = useState<OutputEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('30:00');
  const [socketState, setSocketState] = useState<SocketState>('connecting');
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('active');
  const [sessionEndMessage, setSessionEndMessage] = useState<string | null>(null);
  const [isTimerWarning, setIsTimerWarning] = useState(false);

  // Phase 7: Set Sail screen, audio, and effects
  const [showSetSail, setShowSetSail] = useState(true);
  const [isSetSailLoading, setIsSetSailLoading] = useState(false);
  const [showSmoke, setShowSmoke] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const warningFiredRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const allowReconnectRef = useRef(true);
  const reconnectingRef = useRef(false);
  const sessionEndedRef = useRef(false);
  const warningThresholdMsRef = useRef(DEFAULT_WARNING_THRESHOLD_MINUTES * 60 * 1000);

  const activeFile = files.find((file) => file.id === activeFileId) ?? null;
  const isSessionEnded = sessionStatus === 'ended';
  const isWorkspaceReadOnly = isSessionEnded;

  const appendOutputEntry = useCallback((type: OutputEntry['type'], text: string) => {
    setOutputEntries((prev) => [
      ...prev,
      {
        type,
        text,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const closeExecutionSocket = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const markSessionEnded = useCallback(
    (message: string, endedAtMs?: number | null) => {
      sessionEndedRef.current = true;
      reconnectingRef.current = false;
      setSessionStatus('ended');
      setSessionEndMessage(message);
      setIsRunning(false);
      setIsTimerWarning(false);
      setTimeRemaining('00:00');
      setSocketState('closed');
      if (endedAtMs !== undefined && endedAtMs !== null) {
        setExpiresAtMs(endedAtMs);
      }
      appendOutputEntry('info', `[Session] 🏴‍☠️ Voyage Complete — ${message}\n`);
    },
    [appendOutputEntry],
  );

  const connectExecutionSocket = useCallback((id: string) => {
    setSocketState(reconnectingRef.current ? 'reconnecting' : 'connecting');

    const ws = new WebSocket(`${WS_URL}/sessions/${id}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (reconnectingRef.current) {
        appendOutputEntry('info', '[System] ⚓ Reconnected to the active session.\n');
      }
      reconnectingRef.current = false;
      setSocketState('ready');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as
          | SessionStateMessage
          | SessionEndedMessage
          | { type: 'stdout' | 'stderr' | 'info' | 'error'; data: string }
          | { type: 'exit'; code: number }
          | { type: 'pong'; server_time: string };

        if (message.type === 'stdout' || message.type === 'stderr' || message.type === 'info' || message.type === 'error') {
          appendOutputEntry(message.type, message.data);
          return;
        }

        if (message.type === 'exit') {
          const isSuccess = message.code === 0;
          appendOutputEntry(
            isSuccess ? 'info' : 'error',
            isSuccess
              ? `✨ Treasure Found — [Process exited with code ${message.code}]\n`
              : `⚠️ Mutiny Report — [Process exited with code ${message.code}]\n`,
          );
          // Play success or error sound
          if (isSuccess) {
            audioEngine.play('success');
          } else {
            audioEngine.play('error');
          }
          setIsRunning(false);
          return;
        }

        if (message.type === 'pong') {
          return;
        }

        if (message.type === 'session_state') {
          warningThresholdMsRef.current = message.warning_threshold_minutes * 60 * 1000;
          const nextExpiresAtMs = parseTimestampMs(message.expires_at);
          if (nextExpiresAtMs !== null) {
            setExpiresAtMs(nextExpiresAtMs);
          }

          if (message.status === 'ended') {
            const endedAtMs = parseTimestampMs(message.ended_at);
            markSessionEnded(
              'The session has ended.',
              endedAtMs,
            );
          } else {
            sessionEndedRef.current = false;
            setSessionStatus('active');
            setSessionEndMessage(null);
          }
          return;
        }

        if (message.type === 'session_ended') {
          const endedAtMs = parseTimestampMs(message.ended_at) ?? parseTimestampMs(message.expires_at);
          markSessionEnded(message.message, endedAtMs);
        }
      } catch (error) {
        console.error('Failed to parse WS message', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (!sessionEndedRef.current) {
        setSocketState('error');
      }
      setIsRunning(false);
    };

    ws.onclose = () => {
      wsRef.current = null;
      setIsRunning(false);

      if (!allowReconnectRef.current || sessionEndedRef.current || sessionIdRef.current !== id) {
        setSocketState('closed');
        return;
      }

      reconnectingRef.current = true;
      setSocketState('reconnecting');
      appendOutputEntry('error', '[System] ⚓ Connection lost. Attempting to reconnect…\n');

      if (reconnectTimerRef.current === null) {
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          if (allowReconnectRef.current && sessionIdRef.current === id && !sessionEndedRef.current) {
            connectExecutionSocket(id);
          }
        }, SOCKET_RECONNECT_DELAY_MS);
      }
    };
  }, [appendOutputEntry, markSessionEnded]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Session creation is now triggered by "Set Sail", not on mount
  const initSession = useCallback(async (durationMinutes: number) => {
    try {
      setSocketState('connecting');
      const response = await fetch(`${BACKEND_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: 'python',
          duration_minutes: durationMinutes,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const detail =
          errorBody && typeof errorBody.detail === 'string'
            ? errorBody.detail
            : `Backend returned ${response.status}`;
        throw new Error(detail);
      }

      const data: SessionCreateResponse = await response.json();
      sessionEndedRef.current = false;
      warningThresholdMsRef.current = data.warning_threshold_minutes * 60 * 1000;
      setSessionId(data.session_id);
      setExpiresAtMs(Date.parse(data.expires_at));
      setSessionStatus('active');
      setSessionEndMessage(null);
    } catch (error) {
      console.error('Failed to create session:', error);
      setSessionStatus('error');
      setSocketState('error');
      appendOutputEntry(
        'error',
        `[System] ⚠️ Mutiny Report — Could not connect to backend: ${
          error instanceof Error ? error.message : String(error)
        }\nEnsure Docker is running and the backend is started.`,
      );
    }
  }, [appendOutputEntry]);

  // "Set Sail" handler — creates session and unlocks audio
  const handleSetSail = useCallback(async (durationMinutes: number) => {
    setIsSetSailLoading(true);
    await initSession(durationMinutes);
    setShowSetSail(false);
    setIsSetSailLoading(false);
  }, [initSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      allowReconnectRef.current = false;
      closeExecutionSocket();
    };
  }, [closeExecutionSocket]);

  // Connect WebSocket when sessionId is set
  useEffect(() => {
    if (!sessionId) {
      return;
    }

    allowReconnectRef.current = true;
    connectExecutionSocket(sessionId);

    return () => {
      allowReconnectRef.current = false;
      closeExecutionSocket();
    };
  }, [closeExecutionSocket, connectExecutionSocket, sessionId]);

  // Timer countdown
  useEffect(() => {
    if (expiresAtMs === null) {
      return;
    }

    const updateTimer = () => {
      const remainingMs = Math.max(0, expiresAtMs - Date.now());
      setTimeRemaining(formatTimeRemaining(expiresAtMs));

      const nowWarning =
        sessionStatus === 'active'
        && remainingMs > 0
        && remainingMs <= warningThresholdMsRef.current;

      setIsTimerWarning(nowWarning);

      // Fire warning chime once when we cross the threshold
      if (nowWarning && !warningFiredRef.current) {
        warningFiredRef.current = true;
        audioEngine.play('warning');
      }
    };

    updateTimer();
    const timerId = window.setInterval(updateTimer, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [expiresAtMs, sessionStatus]);

  // WebSocket ping keep-alive
  useEffect(() => {
    if (socketState !== 'ready' || !sessionId || sessionStatus !== 'active') {
      return;
    }

    const pingId = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action: 'ping' }));
      }
    }, SOCKET_PING_INTERVAL_MS);

    return () => {
      window.clearInterval(pingId);
    };
  }, [sessionId, sessionStatus, socketState]);

  // Close socket cleanly on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      allowReconnectRef.current = false;
      closeExecutionSocket();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [closeExecutionSocket]);

  const handleCreateFile = useCallback((name: string) => {
    if (isWorkspaceReadOnly) {
      appendOutputEntry('error', '[Ship\'s Manifest] ⚠️ Voyage Complete — files are now read-only.\n');
      return;
    }

    const trimmedName = name.trim();
    const validationError = validateWorkspaceFilename(trimmedName);
    if (validationError) {
      appendOutputEntry('error', `[Ship's Manifest] ${validationError}\n`);
      return;
    }

    if (files.some((file) => file.name === trimmedName)) {
      appendOutputEntry('error', `[Ship's Manifest] A file named '${trimmedName}' already exists.\n`);
      return;
    }

    const language = getLanguageFromFilename(trimmedName);
    if (!language) {
      appendOutputEntry('error', `[Ship's Manifest] Unsupported file extension for '${trimmedName}'.\n`);
      return;
    }

    const newFile: WorkspaceFile = {
      id: generateId(),
      name: trimmedName,
      content: '',
      language,
    };
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
  }, [appendOutputEntry, files, isWorkspaceReadOnly]);

  const handleRenameFile = useCallback((id: string, newName: string) => {
    if (isWorkspaceReadOnly) {
      appendOutputEntry('error', '[Ship\'s Manifest] ⚠️ Voyage Complete — files are now read-only.\n');
      return;
    }

    const trimmedName = newName.trim();
    const validationError = validateWorkspaceFilename(trimmedName);
    if (validationError) {
      appendOutputEntry('error', `[Ship's Manifest] ${validationError}\n`);
      return;
    }

    if (files.some((file) => file.id !== id && file.name === trimmedName)) {
      appendOutputEntry('error', `[Ship's Manifest] A file named '${trimmedName}' already exists.\n`);
      return;
    }

    const language = getLanguageFromFilename(trimmedName);
    if (!language) {
      appendOutputEntry('error', `[Ship's Manifest] Unsupported file extension for '${trimmedName}'.\n`);
      return;
    }

    setFiles((prev) =>
      prev.map((file) =>
        file.id === id
          ? { ...file, name: trimmedName, language }
          : file,
      ),
    );
  }, [appendOutputEntry, files, isWorkspaceReadOnly]);

  const handleDeleteFile = useCallback((id: string) => {
    if (isWorkspaceReadOnly) {
      appendOutputEntry('error', '[Ship\'s Manifest] ⚠️ Voyage Complete — files are now read-only.\n');
      return;
    }

    setFiles((prev) => {
      const next = prev.filter((file) => file.id !== id);
      if (id === activeFileId) {
        setActiveFileId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  }, [activeFileId, appendOutputEntry, isWorkspaceReadOnly]);

  const handleContentChange = useCallback((fileId: string, content: string) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === fileId ? { ...file, content } : file)),
    );
  }, []);

  // Typing sound handler (debounced to avoid spamming)
  const lastClickTime = useRef(0);
  const handleEditorKeyDown = useCallback(() => {
    const now = Date.now();
    if (now - lastClickTime.current > 60) {
      audioEngine.play('click');
      lastClickTime.current = now;
    }
  }, []);

  /**
   * Phase 4/6 execution convention:
   * The active editor tab is the entry file for the run button.
   * Before execution, the frontend syncs the full workspace and the backend
   * mirrors only same-language files into the matching runtime container.
   */
  const handleRun = useCallback(async () => {
    if (!activeFile || isSessionEnded) {
      return;
    }

    if (!sessionId) {
      appendOutputEntry('error', '[System] ⚠️ Cannot fire cannons: no active session. Is the backend running?\n');
      setIsRunning(false);
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || socketState !== 'ready') {
      appendOutputEntry(
        'error',
        '[System] ⚠️ The execution socket is not ready yet. Wait a moment and try again.\n',
      );
      return;
    }

    setIsRunning(true);
    setShowSmoke(true);
    audioEngine.play('cannon');
    appendOutputEntry('info', `[System] 🔥 Firing cannons — running ${activeFile.name}...\n`);

    try {
      const response = await fetch(`${BACKEND_URL}/sessions/${sessionId}/workspace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_filename: activeFile.name,
          files: files.map((file) => ({
            filename: file.name,
            content: file.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const detail =
          errorBody && typeof errorBody.detail === 'string'
            ? errorBody.detail
            : response.statusText;
        throw new Error(`Failed to sync workspace: ${detail}`);
      }

      wsRef.current.send(JSON.stringify({
        action: 'run',
        filename: activeFile.name,
      }));
    } catch (error) {
      console.error(error);
      appendOutputEntry(
        'error',
        `[System] ⚠️ Mutiny Report — ${error instanceof Error ? error.message : String(error)}\n`,
      );
      setIsRunning(false);
    }
  }, [activeFile, appendOutputEntry, files, isSessionEnded, sessionId, socketState]);

  const handleClearOutput = useCallback(() => {
    setOutputEntries([]);
  }, []);

  const handleSmokeComplete = useCallback(() => {
    setShowSmoke(false);
  }, []);

  const handleToggleMute = useCallback(() => {
    const muted = audioEngine.toggleMute();
    setIsMuted(muted);
  }, []);

  const isRunDisabled =
    isRunning
    || !activeFile
    || !sessionId
    || socketState !== 'ready'
    || sessionStatus !== 'active';

  return (
    <>
      <ParticleBackground />

      <AnimatePresence>
        {showSetSail && (
          <SetSailScreen
            onSetSail={handleSetSail}
            isLoading={isSetSailLoading}
          />
        )}
      </AnimatePresence>

      <div className="app-layout">
        <header className="app-toolbar-area">
          <Toolbar
            onRun={handleRun}
            isRunning={isRunning}
            isRunDisabled={isRunDisabled}
            timeRemaining={timeRemaining}
            isTimerWarning={isTimerWarning}
            isSessionEnded={isSessionEnded}
            sessionEndMessage={sessionEndMessage}
            showSmoke={showSmoke}
            onSmokeComplete={handleSmokeComplete}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
          />
        </header>

        <aside className="app-sidebar">
          <FileTree
            files={files}
            activeFileId={activeFileId}
            onSelectFile={setActiveFileId}
            onCreateFile={handleCreateFile}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
            disabled={isWorkspaceReadOnly}
          />
          <div className="sidebar-profile">
            <div className="profile-avatar-wrapper">
              <img src="/assets/pirate-avatar.png" alt="Captain" className="profile-avatar" />
            </div>
            <div className="profile-info">
              <div className="profile-title">CAPTAIN</div>
              <div className="profile-name">Akumenite</div>
            </div>
          </div>
        </aside>

        <main className="app-main">
          <section className="app-editor-area">
            <CodeEditor
              file={activeFile}
              onContentChange={handleContentChange}
              readOnly={isWorkspaceReadOnly}
              onKeyDown={handleEditorKeyDown}
            />
          </section>
          <section className="app-output-area">
            <OutputPanel entries={outputEntries} onClear={handleClearOutput} />
          </section>
        </main>

        <footer className="app-status-bar">
          <div className="status-left">
            <span className="status-item status-item--success"><span className="status-indicator"></span> Ready to sail</span>
            <span className="status-item"><span className="status-icon">🔴</span> 0 Errors</span>
            <span className="status-item"><span className="status-icon">⚠️</span> 0 Warnings</span>
            <span className="status-item"><span className="status-icon">ℹ️</span> 0 Infos</span>
          </div>
          <div className="status-right">
            <span className="status-item">Ln 14, Col 1</span>
            <span className="status-item">Spaces: 2</span>
            <span className="status-item">UTF-8</span>
            <span className="status-item">LF</span>
            <span className="status-item">JavaScript</span>
            <img src="/assets/anchor.png" alt="Anchor" className="status-anchor" />
          </div>
        </footer>

        {/* Session ended overlay */}
        {isSessionEnded && (
          <motion.div
            className="session-ended-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {/* Background video */}
            <video
              className="session-ended-bg"
              src="/assets/bg.mp4"
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
            />

            {/* Dark vignette overlay */}
            <div className="session-ended-vignette" aria-hidden="true" />

            <motion.div
              className="session-ended-content"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              {/* Logo */}
              <motion.img
                src="/assets/logo.png"
                alt="Akumen Code"
                className="session-ended-logo"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.4, ease: 'easeOut' }}
              />

              {/* Decorative compass rose */}
              <motion.div
                className="session-ended-compass"
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 0.15, rotate: 0 }}
                transition={{ duration: 1.2, delay: 0.5 }}
                aria-hidden="true"
              >
                ⎈
              </motion.div>

              <motion.div
                className="session-ended-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
              >
                <div className="session-ended-icon">🏴‍☠️</div>
                <h2 className="session-ended-title">Voyage Complete</h2>
                <div className="session-ended-divider" />
                <p className="session-ended-message">
                  {sessionEndMessage ?? 'The session has ended. Your work has been recorded.'}
                </p>
                <p className="session-ended-sub">
                  ⚓ Your treasures have been safely stowed ⚓
                </p>
              </motion.div>

              <motion.p
                className="session-ended-footer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                transition={{ duration: 0.5, delay: 1.2 }}
              >
                Powered by Akumen
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </div>
    </>
  );
}
