import React from "react";
import { motion } from "framer-motion";

function Star({ delay = 0, x = 0, y = 0, size = 18 }) {
  return (
    <motion.svg
      initial={{ scale: 0, opacity: 0, x, y, rotate: 0 }}
      animate={{ scale: [0, 1.1, 1], opacity: [0, 1, 1], rotate: [0, 15, -10, 0], x, y }}
      transition={{ duration: 0.8, delay, ease: "easeOut" }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="#FFC84A"
      className="drop-shadow"
      aria-hidden
    >
      <path d="m12 2 2.9 6 6.6 1-4.8 4.6 1.2 6.7L12 17.8 6.1 20.3l1.2-6.7L2.5 9l6.6-1z" />
    </motion.svg>
  );
}

/**
 * Props:
 *  - open: boolean
 *  - title?: string
 *  - onContinue(): void
 */
export default function CelebrationModal({ open, title = "Great job!", onContinue }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center px-4" role="dialog" aria-modal="true">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="relative max-w-sm w-full rounded-2xl bg-white shadow-xl p-6 overflow-hidden"
      >
        {/* star burst layer */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-56 h-40">
            <div className="absolute left-1/2 top-6 -translate-x-1/2">
              <Star delay={0.05} x={-60} y={-10} size={20} />
            </div>
            <div className="absolute left-1/2 top-6 -translate-x-1/2">
              <Star delay={0.1} x={60} y={-6} size={22} />
            </div>
            <div className="absolute left-1/2 top-8 -translate-x-1/2">
              <Star delay={0.18} x={-30} y={10} size={18} />
            </div>
            <div className="absolute left-1/2 top-8 -translate-x-1/2">
              <Star delay={0.22} x={30} y={8} size={18} />
            </div>
            <div className="absolute left-1/2 top-0 -translate-x-1/2">
              <Star delay={0} x={0} y={0} size={28} />
            </div>
          </div>
        </div>

        <div className="relative z-10 text-center mt-2">
          <h3 className="text-2xl font-extrabold text-black">{title}</h3>
          <p className="mt-1 text-black/60 text-sm">You nailed it! Ready for the next one?</p>

          <button
            type="button"
            onClick={onContinue}
            className="mt-5 inline-flex items-center justify-center px-5 py-2 rounded-xl bg-amber-400 text-white font-bold hover:bg-amber-500 transition shadow"
          >
            Continue
          </button>
        </div>
      </motion.div>
    </div>
  );
}
