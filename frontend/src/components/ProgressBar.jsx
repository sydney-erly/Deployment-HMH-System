// frontend/src/components/ProgressBar.jsx
import React from "react";
import { motion } from "framer-motion";

export default function ProgressBar({ progress = 0 }) {
  return (
    <div className="w-full h-4 sm:h-5 bg-[#EAE4D0] rounded-full overflow-hidden shadow-inner">
      <motion.div
        className="h-full rounded-full"
        style={{
          background: "linear-gradient(90deg, #9EED95 0%, #8DF723 60%, #2CE817 100%)",
        }}
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
      />
    </div>
  );
}
