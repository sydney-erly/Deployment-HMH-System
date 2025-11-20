// frontend/src/views/activities/SkipModal.jsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import brokenHeart from "../../assets/broken-heart.png";
import homeIcon from "../../assets/home.png";
import retryIcon from "../../assets/retry.png";

export default function SkipModal({ visible, onSkip, onRetry, lang = "en" }) {
  if (!visible) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-[9999]">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-[#FFF7E3] rounded-3xl shadow-xl p-8 text-center max-w-sm mx-4 border border-[#F9D678]"
        >
          <img src={brokenHeart} className="w-24 h-24 mx-auto mb-4" alt="" />

          <h2 className="text-2xl font-bold text-[#9F2C0C] mb-2">
            {lang === "tl" ? "Oops!" : "Oops!"}
          </h2>

          <p className="text-[#1C4211] mb-6 text-base">
            {lang === "tl"
              ? "Tatlong beses ka nang nagkamali. Ano ang gusto mong gawin?"
              : "You've reached 3 tries. What would you like to do?"}
          </p>

          <div className="flex justify-center gap-10 mt-4">
            {/* Home Button should be redirect to skip button */}
            <button
              onClick={onSkip} 
              className="p-2 rounded-full active:scale-95 transition-transform"
            >
              <img src={homeIcon} className="w-16 h-16 hover:scale-110" alt="" />
            </button>

            {/* RETRY */}
            <button
              onClick={onRetry}
              className="p-2 rounded-full active:scale-95 transition-transform"
            >
              <img src={retryIcon} className="w-16 h-16 hover:scale-110" alt="" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
