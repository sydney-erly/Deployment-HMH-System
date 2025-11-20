// src/views/SessionOver.jsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import pandaWebm from "../assets/panda-sleep.webm"; // your 6s webm

export default function SessionOver() {
  const nav = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      nav("/login", { replace: true });
    }, 6000);
    return () => clearTimeout(t);
  }, [nav]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white text-center text-[#1C4211] px-4 sm:px-6">
      <motion.h1
        className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-2"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        GREAT JOB TODAY!
      </motion.h1>

      <motion.p
        className="text-green-700 text-base sm:text-lg md:text-xl mb-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.8 }}
      >
        Let’s take a little break, see you tomorrow!
      </motion.p>

      <motion.video
        src={pandaWebm}
        autoPlay
        muted
        playsInline
        className="w-60 sm:w-72 md:w-96 h-auto rounded-xl"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1, duration: 1 }}
      />

      <motion.p
        className="text-xs sm:text-sm text-[#1C4211]/60 mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 0.8 }}
      >
        Redirecting to login…
      </motion.p>
    </div>
  );
}
