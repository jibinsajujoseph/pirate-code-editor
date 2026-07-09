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
            src="/akumen-logo.png"
            alt="Akumen Code"
            className="toolbar-logo-img"
          />
        </div>

        <div className="toolbar-divider" />

        {isSessionEnded && (
          <span className="toolbar-session-status toolbar-session-status--ended">
            🏴‍☠️ {sessionEndMessage ?? 'Voyage Complete'}
          </span>
        )}
      </div>

      <div className="toolbar-center">
        <img src="/assets/ide-bg.png" alt="Toolbar Center" className="toolbar-center-img" />
      </div>

      <div className="toolbar-right">
        <div className="toolbar-run-wrapper">
          <button
            className="toolbar-run-btn"
            onClick={onRun}
            disabled={isRunDisabled}
          >
            {isRunning ? '💨 FIRING…' : '🔥 FIRE CANNONS'}
            <img src="/assets/ship-wheel.png" className="btn-icon" alt="wheel" />
          </button>
          <CannonSmoke active={showSmoke} onComplete={onSmokeComplete} />
        </div>
        <button
          className="toolbar-mute-btn"
          onClick={onToggleMute}
          title={isMuted ? 'Unmute audio' : 'Mute audio'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
        <button className="toolbar-icon-btn">🏆</button>
        <button className="toolbar-icon-btn">⚙️</button>

        <div className="toolbar-timer-card">
          <div className="toolbar-timer-label">
            {isSessionEnded ? 'VOYAGE COMPLETE' : '⏳ VOYAGE TIME'}
          </div>
          <div
            className={[
              'toolbar-timer-value',
              isTimerWarning ? 'toolbar-timer-value--warning' : '',
              isSessionEnded ? 'toolbar-timer-value--ended' : '',
            ].filter(Boolean).join(' ')}
          >
            {timeRemaining}
          </div>
        </div>
        <img src="/assets/lantern.png" alt="Lantern" className="toolbar-lantern" />
      </div>
    </div>
  );
}
