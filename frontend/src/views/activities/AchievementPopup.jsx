import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import starImg from "../../assets/star.png";

export default function AchievementPopup({ visible, title }) {
  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 100 }}
          className="fixed top-6 left-1/2 -translate-x-1/2 bg-[#EAE4D0]/95 rounded-2xl shadow-lg px-6 py-3 z-50 flex items-center gap-3 border-2 border-[#9F2C0C]"
        >
          <img src={starImg} alt="star" className="w-10 h-10" />
          <div className="text-left">
            <p className="text-[#1C4211] font-bold text-lg">Achievement Unlocked!</p>
            <p className="text-[#9F2C0C] font-semibold">{title}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
