// frontend/src/views/activities/ActivityRunner.jsx
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { apiFetch } from "../../lib/api";
import { auth } from "../../lib/auth";
import MascotCelebration from "../../components/MascotCelebration";
import LoadingScreen from "../../components/LoadingScreen";

import SoundActivity from "./SoundActivity";
import ImageActivity from "./ImageActivity";
import SequenceActivity from "./SequenceActivity";
import ChooseActivity from "./ChooseActivity";

import EmotionActivity from "./EmotionActivity";
import AsrActivity from "./AsrActivity";

import StarModal from "../../components/StarModal";
import ProgressBar from "../../components/ProgressBar";

import exitIcon from "../../assets/exit.png";
import starIcon from "../../assets/star.png";

import useSessionTicker from "../../hooks/useSessionTicker";

export default function ActivityRunner({ lessonId }) {
  const [activities, setActivities] = useState([]);
  const [index, setIndex] = useState(0); // forward run index
  const [feedback, setFeedback] = useState(null);
  const [showStarModal, setShowStarModal] = useState(false);
  const [starsEarned, setStarsEarned] = useState(0);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();
  const [chapterId, setChapterId] = useState(1);

  // NEW: track skipped activities + review phase
  const [phase, setPhase] = useState("forward"); // "forward" | "review"
  const [reviewIndex, setReviewIndex] = useState(0); // index inside skipped list
  const [skippedIds, setSkippedIds] = useState([]); // array of activity.id

  const progressKey = `hmh_progress:${lessonId}:${lang}`;

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
          Math.max(0, (acts?.length || 1) - 1)
        );
      }
      return { index: startIndex, scores: saved?.scores || [] };
    } catch {
      return null;
    }
  }

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
          const url = new URL(window.location.href);
          const idxParam = parseInt(url.searchParams.get("i") || "", 10);

          const resume = loadProgress(res.activities);
          let startIndex = 0;

          if (Number.isFinite(idxParam)) {
            startIndex = Math.max(
              0,
              Math.min(idxParam, res.activities.length - 1)
            );
          } else if (resume) {
            startIndex = resume.index;
            if (Array.isArray(resume.scores)) setScores(resume.scores);
          }

          setIndex(startIndex);
          const u = new URL(window.location.href);
          u.searchParams.set("i", String(startIndex));
          window.history.replaceState(null, "", u.toString());
        }
      } catch (err) {
        console.error("Load error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, lang]);

  // DERIVE CURRENT ACTIVITY (forward vs review)
  let current = null;
  if (phase === "forward") {
    current = activities[index];
  } else if (phase === "review") {
    const reviewId = skippedIds[reviewIndex];
    current =
      activities.find((a) => a.id === reviewId) || null;
  }

  useEffect(() => {
    if (!activities.length) return;
    if (phase === "forward") {
      // Only persist forward-run progress
      saveProgress(index, scores);
      const url = new URL(window.location.href);
      url.searchParams.set("i", String(index));
      window.history.replaceState(null, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, activities.length, phase]);

  useEffect(() => {
    const onBeforeUnload = () => saveProgress();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") saveProgress();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  //  auto-end & redirect to /session-over when time expires
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

  if (loading) {
    return (
      <LoadingScreen visible={true} chapterId={chapterId} lang={lang} />
    );
  }

  if (!current)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFE5A3]">
        <p>No activities found.</p>
      </div>
    );

  // Helper: finish lesson (called after forward+review)
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
      if (completeRes?.next_lesson_id)
        console.log("Next lesson:", completeRes.next_lesson_id);
      try {
        localStorage.removeItem(progressKey);
      } catch {}
    } catch (e) {
      console.error("Lesson complete error:", e);
    }
  }

  // Navigation after each attempt (forward + review)
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

    if (activePhase === "forward") {
      // Update skipped list if this one was skipped
      let updatedSkipped = activeSkippedIds;
      if (isSkipped && activeCurrent && !activeSkippedIds.includes(activeCurrent.id)) {
        updatedSkipped = [...activeSkippedIds, activeCurrent.id];
        setSkippedIds(updatedSkipped);
      }

      const nextIndex = activeIndex + 1;

      if (nextIndex < activities.length) {
        // Continue forward run
        saveProgress(nextIndex, newScores);
        setIndex(nextIndex);
      } else {
        // Finished forward run
        if (
          updatedSkipped.length > 0 ||
          (isSkipped && activeCurrent && !activeSkippedIds.includes(activeCurrent.id))
        ) {
          // There are skipped activities → start review mode
          setPhase("review");
          setReviewIndex(0);
          try {
            localStorage.removeItem(progressKey);
          } catch {}
        } else {
          // No skipped → finish lesson immediately
          await finishLesson(newScores);
        }
      }
    } else {
      // REVIEW PHASE
      const nextReviewIdx = activeReviewIndex + 1;
      if (nextReviewIdx < activeSkippedIds.length) {
        setReviewIndex(nextReviewIdx);
      } else {
        // All skipped activities reviewed → finish
        await finishLesson(newScores);
      }
    }
  }

  async function handleActivityComplete(submission = {}) {
    if (!current) return;

    const isSkipped = !!submission.skipped;

    // Ensure lesson_id & "skipped" action are in submission
    const payloadSubmission = {
      ...submission,
      lesson_id: lessonId,
    };
    if (isSkipped && !payloadSubmission.action) {
      payloadSubmission.action = "skipped";
    }

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

      // Only show celebration when actually passed (not on skip)
      if (isPassed && !isSkipped) {
        confetti({
          particleCount: 100,
          spread: 80,
          colors: ["#FFC84A", "#2E4BFF", "#FFE5A3"],
          origin: { y: 0.7 },
        });
        const messages =
          lang === "tl"
            ? [
                "Mahusay!",
                "Tama iyon!",
                "Ang galing mo!",
                "Napakaganda!",
                "Tuloy lang!",
                "Wow, mahusay ka!",
                "Tama ang sagot!",
                "Galing!",
                "Magaling!",
                "Ang husay mo!",
              ]
            : [
                "Excellent!",
                "Great job!",
                "You did it!",
                "Amazing work!",
                "Fantastic!",
                "That’s right!",
                "Superb!",
                "Keep it up!",
                "You’re learning fast!",
                "Perfect answer!",
              ];
        setFeedback({
          type: "success",
          message:
            messages[Math.floor(Math.random() * messages.length)],
          achievement: res?.inline_achievements?.length > 0,
        });
      }

      // Capture current context to avoid stale closures
      const ctx = {
        isSkipped,
        newScores,
        activeIndex: index,
        activePhase: phase,
        activeReviewIndex: reviewIndex,
        activeSkippedIds: skippedIds,
        activeCurrent: current,
      };

      setTimeout(() => {
        navigateAfterAttempt(ctx);
      }, 900);
    } catch (err) {
      console.error("Attempt save error:", err);
    }
  }

  function renderActivity() {
    if (current.type === "mcq") {
      if (current.layout === "sound")
        return (
          <SoundActivity
            activity={current}
            onComplete={handleActivityComplete}
          />
        );
      if (current.layout === "image")
        return (
          <ImageActivity
            activity={current}
            onComplete={handleActivityComplete}
          />
        );
      if (current.layout === "sequence")
        return (
          <SequenceActivity
            activity={current}
            onComplete={handleActivityComplete}
          />
        );
      if (current.layout === "choose")
        return (
          <ChooseActivity
            activity={current}
            onComplete={handleActivityComplete}
          />
        );
    }

    if (current.type === "emotion") {
      // Make sure forward-run progress is saved before emotion activity
      saveProgress(index, scores);
      return (
        <EmotionActivity
          activity={current}
          lang={lang}
          onComplete={handleActivityComplete}
        />
      );
    }

    if (current.type === "asr")
      return (
        <AsrActivity activity={current} onComplete={handleActivityComplete} />
      );

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#ffffff] text-[#000000]">
        <p>Unsupported activity type: {current.type}</p>
      </div>
    );
  }

  // Progress bar: forward shows real progress; review shows full
  const forwardProgress =
    ((index + 1) / (activities.length || 1)) * 100;
  const progressValue = phase === "forward" ? forwardProgress : 100;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#FFE5A3] flex flex-col justify-center">
      {/* HEADER */}
      <div className="absolute top-4 left-0 w-full px-8 flex items-center justify-between z-40">
        <button
          onClick={() => {
            saveProgress();
            // Deep-link current lesson & index to dashboard
            const url = new URL(
              "/student-dashboard",
              window.location.origin
            );
            url.searchParams.set("resume_lesson", String(lessonId));
            url.searchParams.set("i", String(index));
            window.location.href = url.toString();
          }}
          className="p-1 hover:scale-110 transition-transform"
        >
          <img
            src={exitIcon}
            alt="exit"
            className="w-6 h-6 sm:w-7 sm:h-7"
          />
        </button>

        <div className="flex-1 mx-5">
          <ProgressBar progress={progressValue} />
          {phase === "review" && skippedIds.length > 0 && (
            <p className="mt-1 text-center text-xs sm:text-sm text-[#1137A0] font-semibold">
              {lang === "tl"
                ? `Ulitin ang mga nilaktawang gawain (${reviewIndex + 1} / ${
                    skippedIds.length
                  })`
                : `Reviewing skipped activities (${reviewIndex + 1} / ${
                    skippedIds.length
                  })`}
            </p>
          )}
        </div>

        <img
          src={starIcon}
          alt="star"
          className="w-6 h-6 sm:w-7 sm:h-7"
        />
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
            transition={{ duration: 0.1, ease: "easeOut" }}
            className="fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[9999] flex flex-col items-center"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.1 }}
              className={`px-8 py-4 rounded-2xl shadow-2xl border-2 text-center backdrop-blur-md ${
                feedback.type === "success"
                  ? "bg-[#FFFCE8]/95 border-[#FFEAA7] text-[#270c9f]"
                  : "bg-[#FFECEC]/95 border-[#FFC8C8] text-[#270c9f]"
              }`}
            >
              <p className="font-bold text-2xl drop-shadow-sm">
                {feedback.message}
              </p>
            </motion.div>
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
    </div>
  );
}
