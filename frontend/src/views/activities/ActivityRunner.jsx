// frontend/src/views/activities/ActivityRunner.jsx
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { apiFetch } from "../../lib/api";
import { auth } from "../../lib/auth";

import SoundActivity from "./SoundActivity";
import ImageActivity from "./ImageActivity";
import SequenceActivity from "./SequenceActivity";
import ChooseActivity from "./ChooseActivity";
import EmotionActivity from "./EmotionActivity";
import AsrActivity from "./AsrActivity";

import SkipModal from "./SkipModal";
import StarModal from "../../components/StarModal";
import ProgressBar from "../../components/ProgressBar";
import LoadingScreen from "../../components/LoadingScreen";

import exitIcon from "../../assets/exit.png";
import starIcon from "../../assets/star.png";

import useSessionTicker from "../../hooks/useSessionTicker";

export default function ActivityRunner({ lessonId }) {
  // -------------------------------
  // STATE
  // -------------------------------
  const [activities, setActivities] = useState([]);
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState("forward"); // forward | review
  const [skippedIds, setSkippedIds] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);

  const [feedback, setFeedback] = useState(null);
  const [showStarModal, setShowStarModal] = useState(false);
  const [starsEarned, setStarsEarned] = useState(0);

  // Skip modal visibility
  const [skipVisible, setSkipVisible] = useState(false);

  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();
  const [chapterId, setChapterId] = useState(1);

  const progressKey = `hmh_progress:${lessonId}:${lang}`;

  // -------------------------------
  // SAVE / LOAD PROGRESS (forward only)
  // -------------------------------
  function saveProgress(nextIndex = index, nextScores = scores) {
    try {
      const bounded = Math.max(
        0,
        Math.min(nextIndex, Math.max(0, activities.length - 1))
      );

      const payload = {
        index: bounded,
        activityId:
          activities[bounded]?.id ?? activities[index]?.id ?? null,
        scores: Array.isArray(nextScores) ? nextScores : [],
        updatedAt: Date.now(),
      };

      localStorage.setItem(progressKey, JSON.stringify(payload));
      localStorage.setItem(
        "hmh_last_lesson",
        JSON.stringify({ lessonId, lang, ...payload })
      );
    } catch {}
  }

  function loadProgress(acts) {
    try {
      const raw = localStorage.getItem(progressKey);
      if (!raw) return null;

      const saved = JSON.parse(raw);
      let startIndex = 0;
      if (saved?.activityId && acts?.length) {
        const byId = acts.findIndex((a) => a.id === saved.activityId);
        if (byId >= 0) startIndex = byId;
      } else if (Number.isFinite(saved?.index)) {
        startIndex = Math.min(
          saved.index,
          Math.max(0, acts.length - 1)
        );
      }
      return { index: startIndex, scores: saved?.scores || [] };
    } catch {
      return null;
    }
  }

  // -------------------------------
  // INITIAL LOAD
  // -------------------------------
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await apiFetch(
          `/student/lesson/${lessonId}/activities?lang=${lang}`,
          { token: auth.token() }
        );

        if (res?.activities) setActivities(res.activities);
        if (res?.meta?.chapter_id) setChapterId(res.meta.chapter_id);

        if (Array.isArray(res?.activities) && res.activities.length > 0) {
          const resume = loadProgress(res.activities);
          let startIndex = 0;

          if (resume) {
            startIndex = resume.index;
            if (Array.isArray(resume.scores)) setScores(resume.scores);
          }

          setIndex(startIndex);
        }
      } catch (err) {
        console.error("Load error:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [lessonId, lang]);

  // -------------------------------
  // Derive current activity
  // -------------------------------
  let current = null;

  if (phase === "forward") {
    current = activities[index];
  } else if (phase === "review") {
    const reviewId = skippedIds[reviewIndex];
    current = activities.find((a) => a.id === reviewId) || null;
  }

  // -------------------------------
  // Persist progress (forward only)
  // -------------------------------
  useEffect(() => {
    if (!activities.length) return;
    if (phase === "forward") saveProgress(index, scores);
  }, [index, activities.length, phase]);

  // -------------------------------
  // Auto session end
  // -------------------------------
  useSessionTicker(() => {
    try {
      saveProgress();
    } catch {}
    alert(
      lang === "tl"
        ? "Tapos na ang oras ng iyong sesyon. Magkita tayo bukas!"
        : "Your session time is over. See you tomorrow!"
    );
    window.location.href = "/session-over";
  });

  if (loading)
    return <LoadingScreen visible={true} chapterId={chapterId} lang={lang} />;

  if (!current)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFE5A3]">
        <p>No activities found.</p>
      </div>
    );

  // -------------------------------
  // Finish Lesson
  // -------------------------------
  async function finishLesson(finalScores) {
    try {
      const completeRes = await apiFetch(
        `/student/lesson/${lessonId}/complete`,
        { method: "POST", token: auth.token() }
      );

      const avg = finalScores.length
        ? finalScores.reduce((a, b) => a + b, 0) / finalScores.length
        : 100;

      let stars = 0;
      if (avg >= 90) stars = 3;
      else if (avg >= 60) stars = 2;
      else if (avg >= 30) stars = 1;

      setStarsEarned(stars);
      setShowStarModal(true);

      localStorage.removeItem(progressKey);
    } catch (err) {
      console.error("Lesson complete error:", err);
    }
  }

  // -------------------------------
  // NAVIGATION AFTER ATTEMPT
  // -------------------------------
  async function navigateAfterAttempt(ctx) {
    const {
      isSkipped,
      newScores,
      activeIndex,
      activePhase,
      activeReviewIndex,
      activeSkippedIds,
      activeCurrent,
    } = ctx;

    setFeedback(null);

    // FORWARD
    if (activePhase === "forward") {
      let updatedSkipped = activeSkippedIds;
      if (isSkipped && !activeSkippedIds.includes(activeCurrent.id)) {
        updatedSkipped = [...activeSkippedIds, activeCurrent.id];
        setSkippedIds(updatedSkipped);
      }

      const nextIndex = activeIndex + 1;

      if (nextIndex < activities.length) {
        setIndex(nextIndex);
      } else {
        // Finished forward run
        if (updatedSkipped.length > 0) {
          setPhase("review");
          setReviewIndex(0);
          localStorage.removeItem(progressKey);
        } else {
          await finishLesson(newScores);
        }
      }
    }

    // REVIEW
    else {
      const nextReviewIdx = activeReviewIndex + 1;
      if (nextReviewIdx < activeSkippedIds.length) {
        setReviewIndex(nextReviewIdx);
      } else {
        await finishLesson(newScores);
      }
    }
  }

  // -------------------------------
  // HANDLE CHILD COMPLETE
  // -------------------------------
  async function handleActivityComplete(submission = {}) {
    if (!current) return;

    const isSkipped = !!submission.skipped;

    // -------------------- FLOW A --------------------
    // If skipped → OPEN MODAL instead of saving attempt
    if (isSkipped && phase === "forward") {
      setSkipVisible(true);
      return; // STOP HERE
    }
    // ------------------------------------------------

    // If skip was CONFIRMED in modal → merge action
    const payloadSubmission = {
      ...submission,
      lesson_id: lessonId,
    };
    if (isSkipped && !payloadSubmission.action) {
      payloadSubmission.action = "skipped";
    }

    // Save attempt
    try {
      const res = await apiFetch("/student/attempt", {
        method: "POST",
        token: auth.token(),
        body: {
          activity_id: current.id,
          lesson_id: lessonId,
          lang,
          submission: payloadSubmission,
        },
      });

      const score = res?.score ?? 0;
      const newScores = [...scores, score];
      setScores(newScores);

      const isPassed =
        payloadSubmission.action === "answer_correct" ||
        payloadSubmission.passed ||
        res?.passed;

      if (isPassed && !isSkipped) {
        confetti({
          particleCount: 100,
          spread: 80,
          colors: ["#FFC84A", "#2E4BFF", "#FFE5A3"],
          origin: { y: 0.7 },
        });

        const messages =
          lang === "tl"
            ? ["Mahusay!", "Tama iyon!", "Galing!", "Magaling!"]
            : ["Great job!", "Correct!", "Awesome!", "You did it!"];

        setFeedback({
          type: "success",
          message:
            messages[Math.floor(Math.random() * messages.length)],
        });
      }

      // NAVIGATION
      const ctx = {
        isSkipped,
        newScores,
        activeIndex: index,
        activePhase: phase,
        activeReviewIndex: reviewIndex,
        activeSkippedIds: skippedIds,
        activeCurrent: current,
      };

      setTimeout(() => navigateAfterAttempt(ctx), 900);
    } catch (err) {
      console.error("Attempt error:", err);
    }
  }

  // -------------------------------
  // RENDER ACTIVITY
  // -------------------------------
  function renderActivity() {
    if (current.type === "mcq") {
      if (current.layout === "sound")
        return <SoundActivity activity={current} onComplete={handleActivityComplete} />;
      if (current.layout === "image")
        return <ImageActivity activity={current} onComplete={handleActivityComplete} />;
      if (current.layout === "sequence")
        return <SequenceActivity activity={current} onComplete={handleActivityComplete} />;
      if (current.layout === "choose")
        return <ChooseActivity activity={current} onComplete={handleActivityComplete} />;
    }

    if (current.type === "emotion") {
      saveProgress(index, scores);
      return <EmotionActivity activity={current} onComplete={handleActivityComplete} />;
    }

    if (current.type === "asr") {
      return <AsrActivity activity={current} onComplete={handleActivityComplete} />;
    }

    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Unsupported type: {current.type}</p>
      </div>
    );
  }

  // -------------------------------
  // HEADER PROGRESS
  // -------------------------------
  const forwardProgress = ((index + 1) / (activities.length || 1)) * 100;
  const progressValue = phase === "forward" ? forwardProgress : 100;

  // -------------------------------
  // RENDER
  // -------------------------------
  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#FFE5A3] flex flex-col justify-center">
      {/* HEADER */}
      <div className="absolute top-4 left-0 w-full px-8 flex items-center justify-between z-40">
        
        {/* EXIT TO DASHBOARD */}
        <button
          onClick={() => {
            saveProgress();
            const url = new URL("/student-dashboard", window.location.origin);
            url.searchParams.set("resume_lesson", String(lessonId));
            url.searchParams.set("i", String(index));
            window.location.href = url.toString();
          }}
          className="p-1 hover:scale-110 transition-transform"
        >
          <img src={exitIcon} alt="exit" className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>

        {/* PROGRESS */}
        <div className="flex-1 mx-5">
          <ProgressBar progress={progressValue} />
          {phase === "review" && skippedIds.length > 0 && (
            <p className="mt-1 text-center text-xs sm:text-sm text-[#1137A0] font-semibold">
              {lang === "tl"
                ? `Ulitin ang mga nilaktawang gawain (${reviewIndex + 1} / ${skippedIds.length})`
                : `Reviewing skipped activities (${reviewIndex + 1} / ${skippedIds.length})`}
            </p>
          )}
        </div>

        <img src={starIcon} alt="star" className="w-6 h-6 sm:w-7 sm:h-7" />
      </div>

      {/* MAIN CONTENT */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id + "-" + phase + "-" + reviewIndex}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {renderActivity()}
        </motion.div>
      </AnimatePresence>

      {/* FEEDBACK */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            key="feedback"
            initial={{ opacity: 0, y: 120, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.9 }}
            transition={{ duration: 0.1 }}
            className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[9999]"
          >
            <div className="px-8 py-4 rounded-2xl shadow-2xl bg-white border">
              <p className="font-bold text-2xl">{feedback.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* STAR MODAL */}
      <StarModal
        visible={showStarModal}
        stars={starsEarned}
        onClose={() => {
          setShowStarModal(false);
          window.location.href = "/student-dashboard";
        }}
      />

      {/* SKIP MODAL */}
      <SkipModal
        visible={skipVisible}
        lang={lang}
        onExit={() => {
          setSkipVisible(false);
          saveProgress();
          window.location.href = "/student-dashboard";
        }}
        onRetry={() => {
          setSkipVisible(false);
          // do nothing → user stays on same activity
        }}
        onSkip={() => {
          setSkipVisible(false);
          handleActivityComplete({ skipped: true, action: "skipped" });
        }}
      />
    </div>
  );
}
