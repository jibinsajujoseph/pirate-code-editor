import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * CannonSmoke — brief particle-burst effect when "Fire Cannons" is clicked.
 *
 * ~12 small lime-green circles burst outward from the trigger point, fade
 * quickly (~600ms total), then unmount. Non-distracting — fires once and
 * disappears.
 */

interface CannonSmokeProps {
  /** Set to true to trigger the burst. Resets automatically. */
  active: boolean;
  onComplete?: () => void;
}

interface SmokeParticle {
  id: number;
  angle: number;
  distance: number;
  size: number;
  delay: number;
}

function generateParticles(): SmokeParticle[] {
  return Array.from({ length: 12 }, (_, i) => ({
    id: i,
    angle: (Math.PI * 2 * i) / 12 + (Math.random() - 0.5) * 0.4,
    distance: 20 + Math.random() * 35,
    size: 3 + Math.random() * 5,
    delay: Math.random() * 0.08,
  }));
}

export default function CannonSmoke({ active, onComplete }: CannonSmokeProps) {
  const [particles, setParticles] = useState<SmokeParticle[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setParticles(generateParticles());
      setVisible(true);

      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 700);

      return () => clearTimeout(timer);
    }
  }, [active, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <div className="cannon-smoke-container" aria-hidden="true">
          {particles.map((p) => {
            const x = Math.cos(p.angle) * p.distance;
            const y = Math.sin(p.angle) * p.distance;

            return (
              <motion.div
                key={p.id}
                className="cannon-smoke-particle"
                initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
                animate={{ x, y, opacity: 0, scale: 0.3 }}
                transition={{
                  duration: 0.55,
                  delay: p.delay,
                  ease: 'easeOut',
                }}
                style={{
                  width: p.size,
                  height: p.size,
                }}
              />
            );
          })}
        </div>
      )}
    </AnimatePresence>
  );
}
