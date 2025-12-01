//
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import { motion, AnimatePresence } from "framer-motion";

import StudentDashboardChapterView from "../views/StudentDashboardChapterView";
import LessonPreview from "../components/LessonPreview";
import LoadingScreen from "../components/LoadingScreen";


import circleImg from "../assets/circle.png";
import lockImg from "../assets/lock.png";

/* ------------------------------------------
   Main Student Dashboard
------------------------------------------ */
export default function StudentDashboard() {
  const nav = useNavigate();
  const [data, setData] = useState(() => ({
    student: { photo_url: localStorage.getItem("hmh_photo_url") || null },
  }));
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [photoPulse, setPhotoPulse] = useState(false);
  const [profileStats, setProfileStats] = useState(null);

  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();

  // Load dashboard data
useEffect(() => {
  async function load() {
    try {
      // Load dashboard UI
      const res = await apiFetch(`/student/student-dashboard?lang=${lang}`, {
        token: auth.token(),
      });

      // Load profile stats (streak + lessons)
      const profile = await apiFetch(`/student/profile`, {
        token: auth.token(),
      });

      setData(res);
      setProfileStats(profile.stats);

      const focus = res?.chapters?.find((ch) => ch.mode === "focus");
      if (focus) setSelectedChapter(focus);
    } catch (e) {
      console.error("Dashboard fetch failed:", e);
      nav("/login");
    } finally {
      setLoading(false);
    }
  }
  load();
}, [nav, lang]);


  // Listen for profile photo updates from StudentProfile
  useEffect(() => {
    function handlePhotoUpdate() {
      const newPhoto = localStorage.getItem("hmh_photo_url");
      if (newPhoto) {
        setData((prev) => ({
          ...prev,
          student: {
            ...prev?.student,
            photo_url: newPhoto,
          },
        }));
        setPhotoPulse(true);
        setTimeout(() => setPhotoPulse(false), 1200);
      }
    }

    window.addEventListener("hmh_photo_updated", handlePhotoUpdate);
    return () => window.removeEventListener("hmh_photo_updated", handlePhotoUpdate);
  }, []);

  const handleLessonOpen = (lesson) => setSelectedLesson(lesson);
  const handleChapterSelect = (chapter) => {
    setSelectedChapter(chapter);
    setShowSelector(false);
  };

  if (loading) {
  return <LoadingScreen visible={true} text="LOADING..." />;
}


  const chapterLabel = lang === "tl" ? "KABANATA" : "CHAPTER";

  return (
    <div
      className={`relative min-h-screen overflow-hidden flex flex-col ${
        selectedChapter?.bg_path ? "bg-transparent" : "bg-[#EAE4D0]"
      }`}
    >
      {/* --- Header --- */}
      <header className="absolute top-0 left-0 w-full flex items-center justify-between px-4 sm:px-6 md:px-10 py-2 sm:py-3 bg-transparent text-[#1C4211] shadow-none z-30">
        {/* Left: Profile (clickable) */}
        <motion.div
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.08 }}
          className="group flex items-center gap-3 cursor-pointer transition"
          onClick={() => nav("/student/profile")}
        >
          <div className="relative">
            {/* Outer glowing ring */}
            <div
              className="absolute inset-0 rounded-full border-[3px] border-yellow-400 
                        shadow-[0_0_10px_rgba(255,223,70,0.7)] 
                        opacity-0 group-hover:opacity-100 transition-all duration-300"
            ></div>

            {/* Profile image */}
            <motion.img
              key={data?.student?.photo_url}
              src={
                data?.student?.photo_url ||
                `${import.meta.env.VITE_ASSETS_BASE}/hmh-images/pfp/defaultpfp.png`
              }
              onError={(e) => {
                e.currentTarget.src = `${import.meta.env.VITE_ASSETS_BASE}/hmh-images/pfp/defaultpfp.png`;
              }}
              alt="Student"
              animate={photoPulse ? { scale: [1, 1.15, 1], rotate: [0, 5, 0] } : {}}
              transition={{ duration: 0.6 }}
              className="w-14 h-14 rounded-full object-cover border-[3px] border-[#EFB623]
                        shadow-[0_4px_8px_rgba(0,0,0,0.25)]"
            />

            {/* Sparkle ring when photo updates */}
            {photoPulse && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0], scale: [1, 1.4, 1.6] }}
                transition={{ duration: 1 }}
                className="absolute inset-0 border-4 border-yellow-300 rounded-full opacity-80"
              />
            )}
          </div>
        </motion.div>

        {/*CHAPTER LABEL  */}
        {selectedChapter && (
          <button
            onClick={() => setShowSelector(true)}
            className="absolute left-1/2 -translate-x-1/2 focus:outline-none group"
          >
            <h2
              className="relative mx-auto px-8 py-2 text-white font-extrabold text-lg sm:text-xl tracking-wide 
                         text-center bg-[#EFB623] rounded-md shadow-md 
                         group-hover:scale-105 transition-transform"
              style={{
                // ribbon left and right ends
                position: "relative",
                display: "inline-block",
              }}
            >
              {`${chapterLabel.toUpperCase()} ${selectedChapter.sort_order}`}
              <span
                className="absolute inset-y-0 left-[-45px] w-[45px] bg-[#D69B1F] z-[-1]"
                style={{
                  top: "8px",
                  clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 25% 50%)",
                  backgroundImage:
                    "linear-gradient(45deg, transparent 50%, #C4871A 50%)",
                  backgroundSize: "20px 20px",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "bottom right",
                }}
              ></span>
              <span
                className="absolute inset-y-0 right-[-45px] w-[45px] bg-[#D69B1F] z-[-1]"
                style={{
                  top: "8px",
                  clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%, 25% 50%)",
                  backgroundImage:
                    "linear-gradient(45deg, transparent 50%, #C4871A 50%)",
                  backgroundSize: "20px 20px",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "bottom right",
                  transform: "scaleX(-1)",
                }}
              ></span>
            </h2>
          </button>
        )}

    {/* Right: Stats */}
<div className="flex flex-col sm:flex-row items-end sm:items-center gap-0.5 sm:gap-5 text-hmhRed font-extrabold text-base sm:text-lg md:text-xl mr-1 sm:mr-0">
  <div className="flex items-center gap-1 drop-shadow-[1px_1px_1px_rgba(0,0,0,0.15)]">
    <span className="text-xl sm:text-2xl md:text-3xl">🔥</span>
    <span>{profileStats?.streakDays || 0}</span>
  </div>
  <div className="flex items-center gap-1 drop-shadow-[1px_1px_1px_rgba(0,0,0,0.15)]">
    <span className="text-xl sm:text-2xl md:text-3xl">⭐</span>
    <span>{profileStats?.lessonsCompleted || 0}</span>
  </div>
</div>

      </header>

      {/* --- Chapter View --- */}
      <main className="flex-1">
        {selectedChapter && (
          <StudentDashboardChapterView
            chapter={selectedChapter}
            onLessonOpen={handleLessonOpen}
          />
        )}
      </main>

      {/* --- Lesson Preview --- */}
      {selectedLesson && (
        <LessonPreview
          lesson={selectedLesson}
          onClose={() => setSelectedLesson(null)}
          onPlay={async (lesson) => {
            const raw = localStorage.getItem("hmh_session");
            const sess = raw ? JSON.parse(raw) : null;
            if (sess?.status === "pending") {
              try {
                await apiFetch("/student/activate-session", {
                  method: "POST",
                  token: auth.token(),
                  body: { session_id: sess.session_id },
                });
                sess.status = "active";
                localStorage.setItem("hmh_session", JSON.stringify(sess));
              } catch (e) {
                console.error("Session activation failed", e);
              }
            }
            setSelectedLesson(null);
            nav(`/lesson/${lesson.id}`);
          }}
        />
      )}

      {/* --- Chapter Selector Modal --- */}
      <AnimatePresence>
        {showSelector && (
          <ChapterSelector
            lang={lang}
            chapters={data?.chapters || []}
            currentId={selectedChapter?.id}
            onSelect={handleChapterSelect}
            onClose={() => setShowSelector(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------
   Chapter Selector (Modal)
------------------------------------------ */
function ChapterSelector({ chapters, currentId, onSelect, onClose, lang }) {
  const modalRef = useRef(null);
  const label = lang === "tl" ? "PUMILI NG KABANATA" : "SELECT CHAPTER";

  const pastelTints = [
    "hue-rotate-[-20deg] brightness-110",
    "hue-rotate-[20deg] brightness-105",
    "hue-rotate-[60deg] brightness-120",
  ];

  const handleOverlayClick = (e) => {
    if (e.target === modalRef.current) onClose();
  };

  return (
    <motion.div
      ref={modalRef}
      onMouseDown={handleOverlayClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-3xl shadow-2xl w-[90%] max-w-md p-6 relative text-center"
      >
        <h3 className="font-extrabold text-[#1C4211] text-xl mb-6 tracking-wide">
          {label}
        </h3>

        <div className="grid grid-cols-3 sm:grid-cols-3 gap-6 justify-items-center">
          {chapters.map((ch, i) => {
            const tint = pastelTints[i % pastelTints.length];
            const isLocked = ch.mode === "locked";

            return (
              <motion.button
                key={ch.id}
                disabled={isLocked}
                onClick={() => !isLocked && onSelect(ch)}
                whileHover={!isLocked ? { scale: 1.05 } : {}}
                whileTap={!isLocked ? { scale: 0.95 } : {}}
                className="relative group focus:outline-none flex flex-col items-center"
              >
                <div
                  className={`relative w-[90px] h-[65px] ${
                    isLocked ? "opacity-70 grayscale" : ""
                  }`}
                >
                  <img
                    src={circleImg}
                    alt="bgCircle"
                    className={`absolute inset-0 w-full h-full object-contain ${tint}`}
                  />

                  {isLocked ? (
                    <img
                      src={lockImg}
                      alt="locked"
                      className="absolute inset-0 m-auto w-6 h-6 opacity-80"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-[#1C4211]">
                      {ch.sort_order}
                    </span>
                  )}
                </div>
              </motion.button>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="absolute top-3 right-4 text-[#1C4211] hover:text-[#9F2C0C] text-lg"
        >
          ✕
        </button>
      </motion.div>
    </motion.div>
  );
}
