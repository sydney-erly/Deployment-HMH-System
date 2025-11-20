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
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [showStarModal, setShowStarModal] = useState(false);
  const [starsEarned, setStarsEarned] = useState(0);
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);

  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();
  const [chapterId, setChapterId] = useState(1);

  const progressKey = `hmh_progress:${lessonId}:${lang}`;
  
  function saveProgress(nextIndex = index, nextScores = scores) {
    try {
      const bounded = Math.max(0, Math.min(nextIndex, Math.max(0, activities.length - 1)));
      const payload = {
        index: bounded,
        activityId: activities[bounded]?.id ?? activities[index]?.id ?? null,
        scores: Array.isArray(nextScores) ? nextScores : [],
        updatedAt: Date.now(),
      };
      localStorage.setItem(progressKey, JSON.stringify(payload));
      localStorage.setItem("hmh_last_lesson", JSON.stringify({ lessonId, lang, ...payload }));
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
        startIndex = Math.min(saved.index, Math.max(0, (acts?.length || 1) - 1));
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
        const res = await apiFetch(`/student/lesson/${lessonId}/activities?lang=${lang}`, { token: auth.token() });

        if (res?.activities) setActivities(res.activities);
        if (res?.meta?.chapter_id) setChapterId(res.meta.chapter_id);

        if (Array.isArray(res?.activities) && res.activities.length > 0) {
          const url = new URL(window.location.href);
          const idxParam = parseInt(url.searchParams.get("i") || "", 10);

          const resume = loadProgress(res.activities);
          let startIndex = 0;

          if (Number.isFinite(idxParam)) {
            startIndex = Math.max(0, Math.min(idxParam, res.activities.length - 1));
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

  const current = activities[index];

  useEffect(() => {
    if (!activities.length) return;
    saveProgress(index, scores);
    const url = new URL(window.location.href);
    url.searchParams.set("i", String(index));
    window.history.replaceState(null, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, activities.length]);

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
    try { saveProgress(); } catch {}
    alert(
      lang === "tl"
        ? "Tapos na ang oras ng iyong sesyon. Magkita tayo bukas!"
        : "Your session time is over. See you tomorrow!"
    );
    window.location.href = "/session-over";
  });

  if (loading) {
    return <LoadingScreen visible={true} chapterId={chapterId} lang={lang} />;
  }

  if (!current)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFE5A3]">
        <p>No activities found.</p>
      </div>
    );

  async function handleActivityComplete(submission) {
    try {
      const res = await apiFetch("/student/attempt", {
        method: "POST",
        token: auth.token(),
        body: {
          activity_id: current.id,
          lesson_id: lessonId,
          lang,
          submission: { ...submission, lesson_id: lessonId },
        },
      });

      const score = res?.score ?? 0;
      const newScores = [...scores, score];
      setScores(newScores);

      if (submission.action === "answer_correct" || submission.passed) {
        confetti({ particleCount: 100, spread: 80, colors: ["#FFC84A", "#2E4BFF", "#FFE5A3"], origin: { y: 0.7 } });
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
        setFeedback({ type: "success", message: messages[Math.floor(Math.random() * messages.length)], achievement: res?.inline_achievements?.length > 0 });
      }

      setTimeout(async () => {
        setFeedback(null);
        const nextIndex = index + 1;
        if (nextIndex < activities.length) {
          saveProgress(nextIndex, newScores);
          setIndex(nextIndex);
        } else {
          try {
            const completeRes = await apiFetch(`/student/lesson/${lessonId}/complete`, { method: "POST", token: auth.token() });
            const avg = newScores.length ? newScores.reduce((a, b) => a + b, 0) / newScores.length : 100;
            let stars = 0;
            if (avg >= 90) stars = 3;
            else if (avg >= 60) stars = 2;
            else if (avg >= 30) stars = 1;
            setStarsEarned(stars);
            setShowStarModal(true);
            if (completeRes?.next_lesson_id) console.log("Next lesson:", completeRes.next_lesson_id);
            try {
              localStorage.removeItem(progressKey);
            } catch {}
          } catch (e) {
            console.error("Lesson complete error:", e);
          }
        }
      }, 900);
    } catch (err) {
      console.error("Attempt save error:", err);
    }
  }

  function renderActivity() {
    if (current.type === "mcq") {
      if (current.layout === "sound") return <SoundActivity activity={current} onComplete={handleActivityComplete} />;
      if (current.layout === "image") return <ImageActivity activity={current} onComplete={handleActivityComplete} />;
      if (current.layout === "sequence") return <SequenceActivity activity={current} onComplete={handleActivityComplete} />;
      if (current.layout === "choose") return <ChooseActivity activity={current} onComplete={handleActivityComplete} />;
    }

    if (current.type === "emotion") {
      saveProgress(index, scores);
      return <EmotionActivity activity={current} lang={lang} onComplete={handleActivityComplete} />;
    }

    if (current.type === "asr") return <AsrActivity activity={current} onComplete={handleActivityComplete} />;

    

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#ffffff] text-[#000000]">
        <p>Unsupported activity type: {current.type}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#FFE5A3] flex flex-col justify-center">
      {/* HEADER */}
      <div className="absolute top-4 left-0 w-full px-8 flex items-center justify-between z-40">
        <button
          onClick={() => {
            saveProgress();
            // Deep-link current lesson & index to dashboard
            const url = new URL("/student-dashboard", window.location.origin);
            url.searchParams.set("resume_lesson", String(lessonId));
            url.searchParams.set("i", String(index));
            window.location.href = url.toString();
          }}
          className="p-1 hover:scale-110 transition-transform"
        >
          <img src={exitIcon} alt="exit" className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>

        <div className="flex-1 mx-5">
          <ProgressBar progress={((index + 1) / (activities.length || 1)) * 100} />
        </div>

        <img src={starIcon} alt="star" className="w-6 h-6 sm:w-7 sm:h-7" />
      </div>

      {/* MAIN CONTENT */}
      <AnimatePresence mode="wait">
        <motion.div key={current.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
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
                feedback.type === "success" ? "bg-[#FFFCE8]/95 border-[#FFEAA7] text-[#270c9f]" : "bg-[#FFECEC]/95 border-[#FFC8C8] text-[#270c9f]"
              }`}
            >
              <p className="font-bold text-2xl drop-shadow-sm">{feedback.message}</p>
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
