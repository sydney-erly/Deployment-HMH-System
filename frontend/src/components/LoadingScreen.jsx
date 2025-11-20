// src/components/LoadingScreen.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Correct asset import
import pandaVideo from "../assets/rdLoading.webm";

export default function LoadingScreen({
  visible = true,
  lang = "en",
  duration = 10000, // 6 seconds
  bg = "#EAF1FF",
  onFinish = () => {},
}) {
  const videoRef = useRef(null);
  const [show, setShow] = useState(visible);
  const [useImgFallback, setUseImgFallback] = useState(false);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  // Handle timed fade-out
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => {
      setShow(false);
      onFinish();
    }, duration);
    return () => clearTimeout(t);
  }, [show, duration, onFinish]);

  // Reduce-motion support
  useEffect(() => {
    if (!show || !videoRef.current) return;
    if (prefersReduced) {
      try {
        videoRef.current.pause();
      } catch {}
    }
  }, [show, prefersReduced]);

  if (!show) return null;

  const text =
    lang === "tl"
      ? "Sandali lang... Naglo-load ang mga aktibidad!"
      : "Hang tight... Loading activities!";

  return (
    <AnimatePresence mode="wait">
      {show && (
        <motion.div
          key="loader"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="fixed inset-0 z-[999] grid place-items-center px-4"
          style={{ backgroundColor: bg }}
        >
          <div className="flex flex-col items-center gap-4 sm:gap-6 select-none">

            {/* Responsive panda loader */}
            {!useImgFallback && !prefersReduced ? (
              <video
                ref={videoRef}
                muted
                loop
                autoPlay
                playsInline
                preload="auto"
                className="w-[160px] h-[160px] sm:w-[220px] sm:h-[220px] md:w-[260px] md:h-[260px]"
                style={{
                  objectFit: "contain",
                  filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.10))",
                }}
                onError={() => setUseImgFallback(true)}
              >
                <source src={pandaVideo} type="video/webm" />
              </video>
            ) : (
              <div
                className="rounded-full bg-[#7db6ff]"
                style={{
                  width: 200,
                  height: 200,
                  boxShadow: "0 8px 16px rgba(0,0,0,0.10)",
                }}
                aria-hidden
              />
            )}

            {/* Loading text */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-[#2E4BFF] font-semibold text-xs sm:text-sm md:text-base tracking-wide text-center"
            >
              {text}
            </motion.p>

            {/* Dots */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex gap-2 mt-1"
            >
              {[0, 1, 2].map((dot) => (
                <motion.div
                  key={dot}
                  className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[#2E4BFF]"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: dot * 0.3,
                  }}
                />
              ))}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
