//src/views/activities/ActivityCard.jsx
import React from "react";
import { motion } from "framer-motion";

export default function ActivityCard({
  image,
  label,
  isSelected,
  isWrong,
  onClick,
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.95, y: 3 }}
      onClick={onClick}
      className={`activity-card flex flex-col items-center justify-center text-center transition-all select-none
        ${isSelected ? "selected" : ""}
        ${isWrong ? "wrong" : ""}`}
    >
      {image && (
        <img
          src={image}
          alt={label}
          className="w-20 h-20 sm:w-28 sm:h-28 mb-2 object-contain"
        />
      )}
      <p className="font-semibold text-base sm:text-lg text-[#5c5c5b]">{label}</p>
    </motion.div>
  );
}
