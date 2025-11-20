import React from "react";
import { motion } from "framer-motion";

export default function HintButton({ icon, onClick }) {
  return (
    <motion.img
      whileTap={{ scale: 0.9 }}
      src={icon}
      alt="hint"
      onClick={onClick}
      className="fixed bottom-6 left-6 sm:bottom-10 sm:left-10 w-12 h-12 sm:w-14 sm:h-14 cursor-pointer hover:scale-110 transition-transform drop-shadow-md z-50"
    />
  );
}
