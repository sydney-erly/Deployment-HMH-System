// frontend/src/views/activities/EmotionActivity.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSound from "use-sound";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router-dom";

import hintIcon from "../../assets/hint.png";
import soundDing from "/sounds/ding.wav";

import HintButton from "../../components/HintButton";
import SkipButton from "../../components/SkipButton";
import ActivityLayout from "./ActivityLayout";
import MascotCelebration from "../../components/MascotCelebration";
import { apiFetch } from "../../lib/api";
import { auth } from "../../lib/auth";

export default function EmotionActivity({ activity, onComplete }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [flash, setFlash] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [passed, setPassed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();
  const [playCorrect] = useSound(soundDing, { volume: 0.6 });
  const navigate = useNavigate();

  // --------------------------------------------------
  // STOP CAMERA (Global Safe Shutdown Function)
  // --------------------------------------------------
  const stopCamera = () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      console.log("📷 Camera stopped");
    } catch (err) {
      console.error("stopCamera() error:", err);
    }
  };

  // --------------------------------------------------
  // Expected emotion (supports all schemas)
  // --------------------------------------------------
  const parsedData =
    typeof activity?.data === "string"
      ? JSON.parse(activity.data)
      : activity?.data || {};

  const expectedEmotion =
    activity?.payload?.expected_emotion ||
    parsedData?.[`expected_emotion_${lang}`] ||
    parsedData?.expected_emotion_en ||
    parsedData?.expected_emotion_tl ||
    parsedData?.expected_emotion ||
    parsedData?.i18n?.[lang]?.expected_emotion ||
    parsedData?.i18n?.en?.expected_emotion ||
    "emotion";

  console.log("🧠 EmotionActivity loaded:", activity);
  console.log("Expected emotion parsed:", expectedEmotion);

  // --------------------------------------------------
  // Camera Setup
  // --------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!mounted) return;

        if (videoRef.current) videoRef.current.srcObject = stream;
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track && track.readyState === "live") {
          setCameraReady(true);
          console.log("🎥 Camera ready");
        }
      } catch (err) {
        console.error("Camera access error:", err);
        setFeedback(
          lang === "tl"
            ? "I-on muna ang iyong kamera para makita kita!"
            : "Please turn on your camera so I can see you!"
        );
        setCameraReady(false);
      }
    }

    startCamera();

    return () => {
      mounted = false;
      stopCamera();   // <--- stop on unmount
    };
  }, [lang]);

  // --------------------------------------------------
  // Capture + Analyze
  // --------------------------------------------------
  const handleCapture = async () => {
    if (!cameraReady || !videoRef.current || loading || passed) return;
    setLoading(true);

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 320;
    canvas.height = videoRef.current.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL("image/jpeg");

    try {
      const res = await apiFetch("/api/emotion/analyze", {
        method: "POST",
        token: auth.token(),
        body: {
          image_base64: base64,
          activities_id: activity.id,
          lesson_id: activity.lesson_id,
          lang,
          auto: true,
        },
      });

      if (!res || res.error) throw new Error(res?.error || "Analysis failed");
      console.log("Backend emotion result:", res);

      setLoading(false);

      if (res.passed) {
        setFlash(true);
        setTimeout(() => setFlash(false), 180);

        setPassed(true);
        playCorrect();
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.7 },
          colors: ["#FFC84A", "#2E4BFF", "#FFE5A3"],
        });

        const msg =
          lang === "tl"
            ? ["Magaling!", "Ayos!", "Tama!"][Math.floor(Math.random() * 3)]
            : ["Yay!", "Nice job!", "Great!"][Math.floor(Math.random() * 3)];

        setFeedback(msg);

        const nextId = res.next_activity?.id || res.next_activity;

        setTimeout(() => {
          stopCamera();    // <--- STOP CAMERA BEFORE NEXT ACTIVITY

          if (nextId) onComplete?.(nextId);
          else
            onComplete?.({
              lesson_id: activity.lesson_id,
              action: "emotion_correct",
              layout: "emotion",
              lang,
            });
        }, 1300);
      } else {
        setFeedback(res.label || "?");
      }
    } catch (err) {
      console.error("Emotion analyze error:", err);
      setFeedback(
        lang === "tl"
          ? "May nangyaring mali. Subukang muli."
          : "Something went wrong. Please try again."
      );
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // Auto Detect Loop
  // --------------------------------------------------
  useEffect(() => {
    if (!cameraReady) return;
    const streamActive =
      streamRef.current &&
      streamRef.current.active &&
      streamRef.current.getVideoTracks().some((t) => t.readyState === "live");

    if (!streamActive) return;

    const interval = setInterval(() => {
      if (!loading && !passed) handleCapture();
    }, 2500);

    return () => clearInterval(interval);
  }, [cameraReady, passed, loading]);

  // --------------------------------------------------
  // Manual Skip (Stop camera first)
  // --------------------------------------------------
  const handleSkip = async () => {
    try {
      stopCamera(); // <--- important

      const res = await apiFetch("/api/emotion/skip", {
        method: "POST",
        token: auth.token(),
        body: { activities_id: activity.id, lesson_id: activity.lesson_id },
      });

      const nextId = res.next_activity?.id || res.next_activity;
      if (nextId) onComplete?.(nextId);
      else navigate("/student-dashboard");
    } catch (err) {
      console.error("Skip failed:", err);
    }
  };

  // --------------------------------------------------
  // Instruction
  // --------------------------------------------------
  const instruction =
    lang === "tl"
      ? `Ipakita ang iyong "${expectedEmotion}" na mukha!`
      : `Can you show me your "${expectedEmotion}" face?`;

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  return (
    <ActivityLayout>
      {/* INSTRUCTION */}
      <div className="w-full flex flex-col items-center justify-center mt-10 mb-8 px-4">
        <motion.h2
          className="text-xl sm:text-2xl md:text-3xl font-bold text-[#1137a0] drop-shadow-sm leading-snug text-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {instruction}
        </motion.h2>
      </div>

      {/* CAMERA */}
      <div className="relative rounded-2xl overflow-hidden shadow-lg w-[320px] h-[240px] bg-gray-200">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        {flash && (
          <motion.div
            className="absolute inset-0 bg-white"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        )}
      </div>

      {/* FEEDBACK */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            key="feedback"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`mt-4 text-center font-semibold ${
              passed ? "text-green-600" : "text-gray-600"
            }`}
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>

      {/* HINT BUTTON */}
      <HintButton icon={hintIcon} onClick={() => setShowHint((v) => !v)} />
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
              ? "Subukang ipakita ang emosyon sa iyong mukha!"
              : "Try to express the emotion with your face!"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SKIP BUTTON */}
      <SkipButton onClick={handleSkip} lang={lang} />

      {passed && <MascotCelebration />}
    </ActivityLayout>
  );
}
