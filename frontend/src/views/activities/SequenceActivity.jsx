//src/views/activities/SequenceActivity.jsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSound from "use-sound";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router-dom";

import hintIcon from "../../assets/hint.png";
import checkBtn from "../../assets/check.png";

import HintButton from "../../components/HintButton";
import CheckButton from "../../components/CheckButton";
import SkipModal from "./SkipModal";
import ActivityLayout from "./ActivityLayout";
import ActivityCard from "./ActivityCard";

const correctSfx = "/sounds/ding.wav";
const wrongSfx = "/sounds/error.wav";

export default function SequenceActivity({ activity, onComplete, onEmptyCheck }) {
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [wrongTries, setWrongTries] = useState(0);
  const [showSkip, setShowSkip] = useState(false);

  const [playCorrect] = useSound(correctSfx);
  const [playWrong] = useSound(wrongSfx);
  const navigate = useNavigate();

  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();
  const choices = activity?.payload?.choices || [];
  const correctKey = activity?.payload?.correct;
  const MAX_WRONG = activity?.meta?.maxWrongTries ?? 3;

  async function handleCheck() {
    if (!selected) {
      onEmptyCheck?.();
      return;
    }

    const isCorrect = selected === correctKey;

    if (isCorrect) {
      playCorrect();
      confetti({
        particleCount: 90,
        spread: 75,
        colors: ["#FFC84A", "#2E4BFF", "#FFE5A3"],
        origin: { y: 0.7 },
      });
      setFeedback("correct");
      setTimeout(() => {
        onComplete?.({
          lesson_id: activity.lesson_id,
          action: "answer_correct",
          layout: "sequence",
          lang,
          choice_key: selected,
          correct_key: correctKey,
          wrong_tries: wrongTries,
        });
      }, 1000);
    } else {
      playWrong();
      setFeedback("wrong");
      setWrongTries((prev) => {
        const next = prev + 1;
        if (next >= MAX_WRONG) setShowSkip(true);
        return next;
      });
      setTimeout(() => setFeedback(null), 700);
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
      {/* HEADER */}
      <div className="w-full flex flex-col items-center justify-center mt-10 mb-8 px-4">
        <div className="max-w-xl w-full text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#1137a0] drop-shadow-sm leading-snug">
            {activity?.prompt ||
              (lang === "tl"
                ? "Piliin ang tamang pagkakasunod-sunod."
                : "Choose the correct one in order.")}
          </h2>
        </div>
      </div>

      {/* CHOICES — uses ActivityCard */}
      <div className="w-full flex flex-wrap justify-center gap-5 sm:gap-8 md:gap-10 max-w-6xl mx-auto pb-10 px-4">
        {choices.map((choice) => (
          <ActivityCard
            key={choice.key}
            image={choice.image}
            label={choice.label}
            isSelected={selected === choice.key}
            isWrong={feedback === "wrong" && selected === choice.key}
            onClick={() => {
              setSelected(choice.key);
              if (choice.audio) new Audio(choice.audio).play().catch(() => {});
            }}
          />
        ))}
      </div>

      {/* HINT + CHECK BUTTONS */}
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
              ? "Pumili ng tamang sagot sa pagkakasunod-sunod."
              : "Pick the correct answer in order or sequence."}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SKIP MODAL */}
      <SkipModal
        visible={showSkip}
        onRetry={handleRetryFromModal}
        onHome={() => navigate("/student-dashboard")}
      />
    </ActivityLayout>
  );
}
