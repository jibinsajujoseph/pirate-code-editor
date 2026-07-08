import CannonSmoke from './CannonSmoke';

interface ToolbarProps {
  onRun: () => void;
  isRunning: boolean;
  isRunDisabled: boolean;
  timeRemaining: string;
  isTimerWarning: boolean;
  isSessionEnded: boolean;
  sessionEndMessage: string | null;
  showSmoke: boolean;
  onSmokeComplete: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

/**
 * Toolbar — pirate command bar with "Fire Cannons" run button,
 * "Voyage Time" timer, mute toggle, and cannon smoke effect.
 *
 * Phase 7 label renames:
 *   Run → Fire Cannons
 *   Running… → Firing…
 *   Time remaining → Voyage Time
 *   Session ended → Voyage Complete
 */
export default function Toolbar({
  onRun,
  isRunning,
  isRunDisabled,
  timeRemaining,
  isTimerWarning,
  isSessionEnded,
  sessionEndMessage,
  showSmoke,
  onSmokeComplete,
  isMuted,
  onToggleMute,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="toolbar-logo">
          <img
            src="/akumen-logo.jpg"
            alt="Akumen Code"
            className="toolbar-logo-img"
          />
          <span className="toolbar-logo-text">
            AKUMEN <span className="toolbar-logo-text-accent">CODE</span>
          </span>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-run-wrapper">
          <button
            className="toolbar-run-btn"
            onClick={onRun}
            disabled={isRunDisabled}
          >
            {isRunning ? '💨 Firing…' : '🔥 Fire Cannons'}
          </button>
          <CannonSmoke active={showSmoke} onComplete={onSmokeComplete} />
        </div>

        {isSessionEnded && (
          <span className="toolbar-session-status toolbar-session-status--ended">
            🏴‍☠️ {sessionEndMessage ?? 'Voyage Complete'}
          </span>
        )}
      </div>

      <div className="toolbar-right">
        <button
          className="toolbar-mute-btn"
          onClick={onToggleMute}
          title={isMuted ? 'Unmute audio' : 'Mute audio'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        <div className="toolbar-timer">
          <span className="toolbar-timer-label">
            {isSessionEnded ? '🏴‍☠️ Voyage Complete:' : '⏳ Voyage Time:'}
          </span>
          <span
            className={[
              'toolbar-timer-value',
              isTimerWarning ? 'toolbar-timer-value--warning' : '',
              isSessionEnded ? 'toolbar-timer-value--ended' : '',
            ].filter(Boolean).join(' ')}
          >
            {timeRemaining}
          </span>
        </div>
      </div>
    </div>
  );
}
