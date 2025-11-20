// src/views/StarModal.jsx
import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import useSound from "use-sound";

import starImg from "../assets/star.png";
import excitedBird from "../assets/excitedBird.png";
import ribbonBanner from "../assets/ribbonbanner.png";

const finishSfx = "/sounds/ding.wav";

export default function StarModal({ visible, stars = 3, onClose }) {
  const [playFinish] = useSound(finishSfx, { preload: true });

  useEffect(() => {
    if (!visible) return;
    confetti({
      particleCount: 200,
      spread: 90,
      colors: ["#FFC84A", "#9F2C0C", "#1C4211", "#EAE4D0"],
      origin: { y: 0.6 },
    });
    playFinish();
  }, [visible, playFinish]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[#1B1E2A]">
            <Sparkles />
          </div>

          {/* Content */}
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 140, damping: 16 }}
            className="relative w-[92vw] max-w-[720px] px-4 overflow-visible"
          >
            {/* Mascot */}
            <motion.img
              src={excitedBird}
              alt="excited bird"
              /* Desktop unchanged; mobile only bigger */
              className="mx-auto mb-15 mt-[-5%] h-70 select-none max-sm:h-[180px]"
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 14 }}
              draggable={false}
            />

            {/* ===== Ribbon with arched stars ===== */}
            <div
              /* Desktop width stays 60%; mobile can be wider */
              className="relative w-[60%] mx-auto max-sm:w-[95%] max-sm:max-w-[520px]"
            >
              <img
                src={ribbonBanner}
                alt="ribbon banner"
                className="
                  mx-auto select-none w-full h-auto
                  origin-center
                  max-sm:scale-[1.2]   /* bigger ribbon on phones */
                  max-sm:translate-y-[2px] /* tiny nudge to keep alignment */
                "
                style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,.25))" }}
                draggable={false}
              />

              {/* ⭐ Arched stars */}
              <div
                className="
                  absolute left-1/2 -translate-x-1/2 z-10 flex items-center justify-center gap-6
                  top-[-22%] max-sm:top-[-35%]
                "
              >

                {[0, 1, 2].map((i) => {
                  const mid = 1;
                  const CURVE_DEG = 20;
                  const DROP_PX = 20;
                  const rotateDeg = (i - mid) * CURVE_DEG;
                  const yOffset = Math.abs(i - mid) * DROP_PX;

                  return (
                    <motion.img
                      key={i}
                      src={starImg}
                      alt="star"
                      width={65}
                      height={65}
                      /* keep desktop the same; slight compress on mobile if needed */
                      className="max-sm:w-[60px] max-sm:h-auto "
                      style={{
                        filter:
                          i < stars
                            ? "drop-shadow(0 0 14px rgba(255,217,106,.8)) drop-shadow(0 4px 0 rgba(0,0,0,.28))"
                            : "opacity(0.35)",
                        transformOrigin: "50% 100%",
                      }}
                      initial={{ scale: 0, rotate: rotateDeg, y: yOffset }}
                      animate={{ scale: [0, 1.15, 1.35], rotate: rotateDeg, y: yOffset }}
                      transition={{ delay: i * 0.15, duration: 0.5, type: "spring" }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Headline & subtext (desktop untouched) */}
            <motion.h2
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="text-center text-5xl font-extrabold text-[#FF9B00]"
              style={{
                textShadow: "0 2px 0 #5a2a00, 0 4px 0 #5a2a00, 0 6px 0 rgba(0,0,0,0.35)",
                letterSpacing: "1px",
              }}
            >
              GREAT JOB!
            </motion.h2>

            <p className="mt-3 text-center text-[#EAE4D0] opacity-90">
              You’ve earned {stars} {stars === 1 ? "star" : "stars"}!
            </p>

            {/* Continue button */}
            <div className="mt-6 flex justify-center">
              <motion.button
                whileHover={{ scale: 1.05, y: -1 }}
                whileTap={{ scale: 0.98, y: 0 }}
                onClick={onClose}
                className="px-6 py-3 rounded-full font-semibold bg-[#FFC84A] text-[#1C4211] border-2 border-[#F9D678] shadow-[0_6px_0_#9F2C0C]"
              >
                Continue
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Twinkling stars background ---------- */
function Sparkles() {
  const dots = new Array(14).fill(0).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 1.5,
    size: Math.random() * 6 + 4,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d) => (
        <motion.div
          key={d.id}
          className="absolute"
          initial={{ opacity: 0, scale: 0.6, rotate: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0.6, 1, 0.6], rotate: 180 }}
          transition={{ duration: 1.6, repeat: Infinity, delay: d.delay }}
          style={{ left: `${d.x}%`, top: `${d.y}%` }}
        >
          <div className="relative" style={{ width: d.size, height: d.size }}>
            <div className="absolute inset-0 bg-white/90 rotate-45" />
            <div className="absolute inset-0 bg-white/60 blur-[2px] rotate-45" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
