import React from "react";
import { motion } from "framer-motion";

export default function CheckButton({ icon, onClick, disabled }) {
  return (
    <motion.img
      whileTap={{ scale: 0.9 }}
      src={icon}
      alt="check"
      onClick={!disabled ? onClick : undefined}
      className={`fixed bottom-6 right-6 sm:bottom-10 sm:right-10 w-12 h-12 sm:w-14 sm:h-14 cursor-pointer transition-transform z-50 ${
        disabled
          ? "opacity-40 pointer-events-none"
          : "hover:scale-110 drop-shadow-md"
      }`}
    />
  );
}
