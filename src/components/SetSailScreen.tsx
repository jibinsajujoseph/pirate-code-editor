import { useState } from 'react';
import { motion } from 'framer-motion';
import { audioEngine } from '../audio-engine';

/**
 * SetSailScreen — full-screen overlay that gates the session.
 *
 * Shows the Akumen pirate logo with an intro animation, the app title,
 * and a "Set Sail" button. Clicking it:
 *   1. Initializes the audio context (browser autoplay requirement)
 *   2. Triggers session creation via the onSetSail callback
 *   3. Dismisses the overlay with an exit animation
 */

interface SetSailScreenProps {
  onSetSail: (durationMinutes: number) => void;
  isLoading: boolean;
}

export default function SetSailScreen({ onSetSail, isLoading }: SetSailScreenProps) {
  const [duration, setDuration] = useState(30);
  const handleClick = () => {
    if (isLoading) return;
    audioEngine.init();
    onSetSail(duration);
  };

  return (
    <motion.div
      className="set-sail-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      {/* Dark overlay vignette for text readability */}
      <div className="set-sail-overlay" aria-hidden="true" />

      {/* Decorative quote card — top left */}
      <motion.div
        className="set-sail-quote"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 1.2 }}
      >
        <span className="set-sail-quote-mark">"</span>
        <p>Every great captain starts with one line of code.</p>
      </motion.div>

      <motion.div
        className="set-sail-content"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        {/* Logo with intro animation */}
        <motion.div
          className="set-sail-logo-wrapper"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
        >
          {/* Green glow behind logo */}
          <motion.div
            className="set-sail-logo-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 0.8 }}
          />
          <motion.img
            src="/assets/logo.png"
            alt="Akumen Code"
            className="set-sail-logo-img"
            initial={{ opacity: 0, rotate: -5 }}
            animate={{ opacity: 1, rotate: 0 }}
            transition={{ duration: 1, delay: 0.4, ease: 'easeOut' }}
          />
        </motion.div>

        <motion.h1
          className="set-sail-title"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          AKUMEN <span className="set-sail-title-accent">CODE</span>
        </motion.h1>

        <motion.p
          className="set-sail-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.1 }}
        >
          <span className="set-sail-subtitle-dash">⚓</span>{' '}
          Embark on Your Coding Voyage{' '}
          <span className="set-sail-subtitle-dash">⚓</span>
        </motion.p>

        {/* Duration panel */}
        <motion.div
          className="set-sail-panel"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.2 }}
        >
          <div className="set-sail-panel-header">
            <span className="set-sail-panel-header-icon">⚓</span>
            <span>Voyage Duration</span>
          </div>

          <div className="set-sail-slider-value">{duration}</div>

          <div className="set-sail-slider-container">
            <span className="set-sail-slider-bound">1</span>
            <input
              id="duration-slider"
              type="range"
              min="1"
              max="60"
              step="1"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="set-sail-slider"
              disabled={isLoading}
            />
            <span className="set-sail-slider-bound">60</span>
          </div>
          <div className="set-sail-slider-unit">Minutes</div>

          <motion.button
            className="set-sail-btn"
            onClick={handleClick}
            disabled={isLoading}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            {isLoading ? (
              <span className="set-sail-btn-loading">Preparing Vessel…</span>
            ) : (
              <>
                <img
                  src="/assets/anchor.png"
                  alt=""
                  className="set-sail-btn-anchor"
                />
                <span className="set-sail-btn-text">Set Sail</span>
              </>
            )}
          </motion.button>
        </motion.div>
      </motion.div>

      <motion.p
        className="set-sail-footer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ duration: 0.5, delay: 1.8 }}
      >
        Powered by Akumen
      </motion.p>
    </motion.div>
  );
}
