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
  const [duration, setDuration] = useState(45);
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
      {/* Subtle background particles for the splash */}
      <div className="set-sail-particles" aria-hidden="true">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="set-sail-particle-dot"
            initial={{
              x: Math.random() * window.innerWidth - window.innerWidth / 2,
              y: Math.random() * window.innerHeight - window.innerHeight / 2,
              opacity: 0,
            }}
            animate={{
              opacity: [0, Math.random() * 0.3 + 0.05, 0],
              y: (Math.random() - 0.5) * 100,
            }}
            transition={{
              duration: 4 + Math.random() * 4,
              repeat: Infinity,
              delay: Math.random() * 3,
            }}
            style={{
              width: Math.random() * 3 + 1,
              height: Math.random() * 3 + 1,
            }}
          />
        ))}
      </div>

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
            src="/akumen-logo.jpg"
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
          Pirate Command Center
        </motion.p>

        <motion.div
          className="set-sail-input-group"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.2 }}
        >
          <label htmlFor="duration-input" className="set-sail-label">Voyage Duration (minutes)</label>
          <input
            id="duration-input"
            type="number"
            min="1"
            max="1440"
            value={duration}
            onChange={(e) => setDuration(Math.max(1, Number(e.target.value)))}
            className="set-sail-input"
            disabled={isLoading}
          />
        </motion.div>

        <motion.button
          className="set-sail-btn"
          onClick={handleClick}
          disabled={isLoading}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.4 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
        >
          {isLoading ? (
            <span className="set-sail-btn-loading">Preparing Vessel…</span>
          ) : (
            <>⚓ Set Sail</>
          )}
        </motion.button>
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
