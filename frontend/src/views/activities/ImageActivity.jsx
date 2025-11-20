//src/views/activities/ImageActivity.jsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { assetUrl } from "../../lib/media";

import HintButton from "../../components/HintButton";
import CheckButton from "../../components/CheckButton";
import ActivityLayout from "./ActivityLayout";
import SkipModal from "./SkipModal";

import hintIcon from "../../assets/hint.png";
import checkBtn from "../../assets/check.png";

const correctSfx = "/sounds/ding.wav";
const wrongSfx = "/sounds/error.wav";

export default function ImageActivity({ activity, onComplete, onEmptyCheck }) {
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  const [showSkip, setShowSkip] = useState(false);

  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();
  const promptImage = activity?.payload?.prompt_image;
  const choices = activity?.payload?.choices || [];
  const correctKey = activity?.payload?.correct;
  const MAX_WRONG = activity?.meta?.maxWrongTries ?? 3;

  const playSound = (path) => {
    if (!path) return;
    const audio = new Audio(path);
    audio.play().catch(() => {});
  };

  const playCorrect = () => playSound(correctSfx);
  const playWrong = () => playSound(wrongSfx);

  // detect if circular set (emoji-like)
  const isCircleSet =
    choices.length <= 4 &&
    choices.every((c) =>
      /(happy|sad|angry|surprise|masaya|malungkot|galit|magugulat)/i.test(
        c.image || ""
      )
    );

  async function handleCheck() {
    if (!selected) {
      onEmptyCheck?.();
      return;
    }

    const isCorrect = selected === correctKey;

    if (isCorrect) {
      playCorrect();
      confetti({
        particleCount: 80,
        spread: 80,
        colors: ["#FFC84A", "#2E4BFF", "#FFE5A3"],
        origin: { y: 0.7 },
      });
      setFeedback("correct");

      setTimeout(() => {
        onComplete?.({
          lesson_id: activity.lesson_id,
          action: "answer_correct",
          layout: "image",
          lang,
          choice_key: selected,
          correct_key: correctKey,
          wrong_tries: wrongTries,
        });
      }, 1200);
    } else {
      playWrong();
      setFeedback("wrong");
      setWrongTries((prev) => {
        const next = prev + 1;
        if (next >= MAX_WRONG) setShowSkip(true);
        return next;
      });
      setTimeout(() => setFeedback(null), 800);
    }
  }

  function handleRetryFromModal() {
    setShowSkip(false);
    setWrongTries(0);
    setSelected(null);
    setFeedback(null);
  }

  return (
    <ActivityLayout>
      {/* MAIN LAYOUT */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-5 px-4 md:px-8 w-full mt-8 max-w-5xl mx-auto">
  {/* LEFT: PROMPT IMAGE */}
  {promptImage && (
    <motion.img
      key={promptImage}
      src={assetUrl(promptImage)}
      alt="prompt"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
      className="w-[60%] sm:w-[35%] md:w-[30%] max-w-sm object-contain drop-shadow-md"
    />
  )}

  {/* RIGHT: PROMPT TEXT + CHOICES */}
  <div className="flex flex-col items-center md:items-start text-center md:text-left">
    <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#1137a0] mb-4 leading-snug tracking-wide drop-shadow-sm max-w-lg">
      {activity?.prompt ||
        (lang === "tl"
          ? "Ano ang nararamdaman ng bata?"
          : "How does the child feel?")}
    </h2>

    <div
      className={`grid place-items-center gap-4 ${
        isCircleSet
          ? "grid-cols-4"
          : "grid-cols-2 sm:grid-cols-3 md:grid-cols-2"
      }`}
    >
      {choices.map((choice) => (
        <motion.button
          key={choice.key}
          whileTap={{ scale: 0.9 }}
          animate={
            feedback === "wrong" && selected === choice.key
              ? { x: [0, -8, 8, -6, 6, 0], transition: { duration: 0.4 } }
              : {}
          }
          onClick={() => setSelected(choice.key)}
          className={`flex items-center justify-center rounded-full p-2 transition-all duration-300 border-4 ${
            selected === choice.key
              ? feedback === "wrong"
                ? "border-[#E65460]"
                : "border-[#2E4BFF] ring-4 ring-[#D7E6FF] ring-offset-2"
              : "border-transparent"
          }`}
        >
          <img
            src={assetUrl(choice.image)}
            alt={choice.label}
            className={`${
              isCircleSet
                ? "w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28"
                : "w-28 h-20 sm:w-36 sm:h-24 md:w-44 md:h-32"
            } object-contain`}
          />
        </motion.button>
      ))}
    </div>
  </div>
</div>


      {/* HINT & CHECK BUTTONS */}
      <HintButton icon={hintIcon} onClick={() => setShowHint((v) => !v)} />
      <CheckButton icon={checkBtn} onClick={handleCheck} disabled={!selected} />

      {/* HINT BOX */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-6 sm:left-10 bg-white/95 border border-[#F9D678] rounded-xl px-4 py-3 text-sm sm:text-base shadow-md max-w-xs sm:max-w-sm"
          >
            💡{" "}
            {lang === "tl"
              ? "Tingnan mabuti ang larawan at pumili ng tamang sagot."
              : "Look carefully at the picture and choose the correct emotion."}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SKIP MODAL */}
      <SkipModal
        visible={showSkip}
        onRetry={handleRetryFromModal}
        onHome={() => (window.location.href = "/student-dashboard")}
      />
    </ActivityLayout>
  );
}
