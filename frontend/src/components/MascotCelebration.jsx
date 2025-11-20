import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { assetUrl } from "../lib/media";

/**
 * MascotCelebration
 * Shows the chapter mascot (webm animation or png) rising from bottom
 * when a milestone or achievement is earned.
 * Props:
 * - visible: boolean → show/hide
 * - chapterId: number (1–6)
 * - message: optional text below mascot
 */
export default function MascotCelebration({ visible, chapterId, message = "Great job!" }) {
  const mascots = {
    1: "hmh-images/mascots/redpanda.webm",
    2: "hmh-images/mascots/penguin.webm",
    3: "hmh-images/mascots/koala.webm",
    4: "hmh-images/mascots/bear.webm",
    5: "hmh-images/mascots/bird.webm",
    6: "hmh-images/mascots/panda.webm",
  };

  const src = mascots[chapterId] ? assetUrl(mascots[chapterId]) : assetUrl(mascots[1]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="mascot"
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center z-[9998]"
        >
          <video
            key={src}
            src={src}
            autoPlay
            loop
            muted
            playsInline
            className="w-40 sm:w-48 md:w-56 h-auto drop-shadow-xl"
          />
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-2 font-bold text-lg sm:text-xl text-[#1137a0] drop-shadow-sm"
          >
            {message}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
