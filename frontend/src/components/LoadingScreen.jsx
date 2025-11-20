// src/components/LoadingScreen.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { assetUrl } from "../lib/media";

//  Chapter-based mascot loaders
const CHAPTER_LOADERS = {
  1: "src/assets/mascots/redpandaLoad.webm",
  2: "src/assets/mascots/penguinLoad.webm",
  3: "src/assets/mascots/koalaLoad.webm",
  4: "src/assets/mascots/bearLoad.webm",
  5: "src/assets/mascots/birdLoad.webm",
  6: "src/assets/mascots/pandaLoad.webm",

};

// 📘 Optional: Chapter label text
const CHAPTER_NAMES = {
  1: "Red Panda",
  2: "Penguin",
  3: "Koala",
  4: "Bear",
  5: "Bird",
  6: "Panda",
};

/**
 * A fully self-contained loading overlay:
 * - Plays the mascot loop per chapter
 * - Handles fade transitions
 * - Localized loading text
 * - Optional chapter label
 */
export default function LoadingScreen({
  visible = true,
  chapterId = 1,
  lang = "en",
  bg = "#EAF1FF",
}) {
  const [useImgFallback, setUseImgFallback] = useState(false);
  const videoRef = useRef(null);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  useEffect(() => {
    if (!visible || !videoRef.current) return;
    if (prefersReduced) {
      try {
        videoRef.current.pause();
      } catch {}
    }
  }, [visible, prefersReduced]);

  if (!visible) return null;

  const chapterName = CHAPTER_NAMES[chapterId] || "";
  const videoSrc = CHAPTER_LOADERS[chapterId] || CHAPTER_LOADERS[1];

  const text =
    lang === "tl"
      ? "Sandali lang... Naglo-load ang mga aktibidad!"
      : "Hang tight... Loading activities!";

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          key="loading"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[999] grid place-items-center"
          style={{ backgroundColor: bg }}
        >
          <div className="flex flex-col items-center gap-6 select-none">
            {/* Video mascot */}
            {!useImgFallback && !prefersReduced ? (
              <video
                ref={videoRef}
                muted
                loop
                autoPlay
                playsInline
                preload="auto"
                width={260}
                height={260}
                style={{
                  width: 260,
                  height: 260,
                  objectFit: "contain",
                  filter: "drop-shadow(0 8px 16px rgba(0,0,0,0.10))",
                }}
                onError={() => setUseImgFallback(true)}
                controls={false}
                disablePictureInPicture
                controlsList="nodownload nofullscreen noplaybackrate"
              >
                <source src={videoSrc} type="video/webm" />
              </video>
            ) : (
              <div
                className="rounded-full"
                style={{
                  width: 260,
                  height: 260,
                  background: "#7db6ff",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.10)",
                }}
                aria-hidden
              />
            )}

            {/* Chapter name label */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-[#1137a0] text-base sm:text-lg font-bold tracking-wide"
            >
              {lang === "tl"
                ? `Kabanata ${chapterId}: ${chapterName}`
                : `Chapter ${chapterId}: ${chapterName}`}
            </motion.p>

            {/* Typewriter text */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-sm sm:text-base font-semibold text-[#2E4BFF] tracking-wide"
              style={{ letterSpacing: "0.06em" }}
            >
              <span className="hmh-typing">{text}</span>
            </motion.div>

            {/* Progress Dots (optional aesthetic) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="flex gap-2 mt-2"
            >
              {[0, 1, 2].map((dot) => (
                <motion.div
                  key={dot}
                  className="w-2 h-2 rounded-full bg-[#2E4BFF]"
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
