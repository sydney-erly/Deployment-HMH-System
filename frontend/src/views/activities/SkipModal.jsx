// frontend/src/views/activities/SkipModal.jsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";

import brokenHeart from "../../assets/broken-heart.png";
import closeIcon from "../../assets/home.png";       
import skipIcon from "../../assets/play.png";    
import retryIcon from "../../assets/retry.png"; 

export default function SkipModal({ visible, onSkip, onRetry, onExit, lang = "en" }) {
  if (!visible) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-[9999]">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-[#FFF7E3] rounded-3xl shadow-2xl p-8 text-center max-w-sm mx-4 border-4 border-[#F9D678]"
        >
          <img src={brokenHeart} className="w-24 h-24 mx-auto mb-3" />

          <h2 className="text-3xl font-extrabold text-[#9F2C0C] mb-1 drop-shadow">
            {lang === "tl" ? "Oops!" : "Oops!"}
          </h2>

          <p className="text-[#1C4211] mb-6 text-lg font-medium">
            {lang === "tl"
              ? "Tatlong beses ka nang nagkamali. Ano ang gusto mong gawin?"
              : "You've reached 3 tries. What would you like to do?"}
          </p>

          {/* BUTTON ROW */}
          <div className="flex justify-center gap-6">
            
            {/* ❌ EXIT */}
            <button
              onClick={onExit}
              className="active:scale-95 transition-transform"
            >
              <img
                src={closeIcon}
                className="w-16 h-16 hover:scale-110 transition-transform"
                alt="exit"
              />
            </button>

            {/* ▶️ SKIP */}
            <button
              onClick={onSkip}
              className="active:scale-95 transition-transform"
            >
              <img
                src={skipIcon}
                className="w-20 h-20 hover:scale-110 transition-transform"
                alt="skip"
              />
            </button>

            {/* 🔄 RETRY */}
            <button
              onClick={onRetry}
              className="active:scale-95 transition-transform"
            >
              <img
                src={retryIcon}
                className="w-16 h-16 hover:scale-110 transition-transform"
                alt="retry"
              />
            </button>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
