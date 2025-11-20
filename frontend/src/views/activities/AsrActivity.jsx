// frontend/src/views/activities/AsrActivity.jsx

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useSound from "use-sound";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { auth } from "../../lib/auth";

import soundIcon from "../../assets/sound-icon.png";
import micIcon from "../../assets/mic.png";
import hintIcon from "../../assets/hint.png";

import HintButton from "../../components/HintButton";
import SkipButton from "../../components/SkipButton";
import ActivityLayout from "./ActivityLayout";
import SkipModal from "./SkipModal"; // 3-tries modal

const correctSfx = "/sounds/ding.wav";
const wrongSfx = "/sounds/error.wav";

export default function AsrActivity({ activity, onComplete }) {
  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();
  const nav = useNavigate();

  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef(null);

  const [feedback, setFeedback] = useState("");
  const [passed, setPassed] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);

  // NEW: tries + skip modal
  const [tries, setTries] = useState(0);
  const [skipVisible, setSkipVisible] = useState(false);

  const [playCorrect] = useSound(correctSfx);
  const [playWrong] = useSound(wrongSfx);

  // ---------------------------------------------
  // Extract ASR payload (supports payload + data.i18n)
  // ---------------------------------------------
  const expectedSpeech =
    activity?.payload?.expected_speech ||
    activity?.payload?.expected_text ||
    activity?.payload?.data?.i18n?.[lang]?.expected_speech ||
    activity?.payload?.data?.i18n?.[lang]?.expected_text ||
    activity?.payload?.data?.i18n?.en?.expected_speech ||
    activity?.payload?.data?.i18n?.en?.expected_text ||
    activity?.data?.i18n?.[lang]?.expected_speech ||
    activity?.data?.i18n?.[lang]?.expected_text ||
    activity?.data?.i18n?.en?.expected_speech ||
    activity?.data?.i18n?.en?.expected_text ||
    "word";

  const promptAudio =
    activity?.payload?.prompt_audio ||
    activity?.payload?.data?.i18n?.[lang]?.prompt_audio ||
    activity?.payload?.data?.i18n?.en?.prompt_audio ||
    activity?.data?.i18n?.[lang]?.prompt_audio ||
    activity?.data?.i18n?.en?.prompt_audio;

  const promptImage =
    activity?.payload?.prompt_image ||
    activity?.payload?.data?.i18n?.[lang]?.prompt_image ||
    activity?.payload?.data?.i18n?.en?.prompt_image ||
    activity?.data?.i18n?.[lang]?.prompt_image ||
    activity?.data?.i18n?.en?.prompt_image;

  const instruction =
    lang === "tl"
      ? `Sabihin ang salita: "${expectedSpeech}".`
      : `Can you say the word: "${expectedSpeech}"?`;

  const playPrompt = () => {
    if (!promptAudio) return;
    const audio = new Audio(promptAudio);
    audio.play().catch(() => {});
  };

  // ---------------------------------------------
  // Inject waveform animation CSS once
  // ---------------------------------------------
  useEffect(() => {
    const id = "hmh-asr-wave-style";
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;
    style.innerHTML = `
      @keyframes asrPulse {
        0%   { transform: scaleY(0.3); opacity: .7; }
        50%  { transform: scaleY(1.2); opacity: 1; }
        100% { transform: scaleY(0.3); opacity: .7; }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Normalize string for matching
  const norm = (s) =>
    (s || "").toLowerCase().replace(/[.,!?]/g, "").replace(/\s+/g, " ").trim();

  // ---------------------------------------------
  // Recording control
  // ---------------------------------------------
  async function startRecording() {
    setFeedback("");
    setTranscript("");
    setPassed(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());

        if (blob.size === 0) {
          setFeedback(lang === "tl" ? "Walang tunog." : "No sound recorded.");
          setRecording(false);
          return;
        }

        await submitAudio(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setFeedback(lang === "tl" ? "Buksan ang mikropono." : "Enable microphone.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }

  // ---------------------------------------------
  // Submit audio to backend
  // ---------------------------------------------
  async function submitAudio(blob) {
  setLoading(true);

  try {
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");
    formData.append("lang", lang);
    formData.append("activities_id", activity.id);
    formData.append("lesson_id", activity.lesson_id);

    const res = await apiFetch("/api/asr/analyze", {
      method: "POST",
      token: auth.token && auth.token(),
      body: formData,
    });

    const backendText = res?.text || "";
    setTranscript(backendText);

    // ✅ TRUST BACKEND
    let localPassed = !!res?.passed;

    // (optional) fallback for older backend without `passed`
    if (res?.passed === undefined) {
      const heard = norm(backendText);
      const expected = norm(expectedSpeech);
      localPassed =
        heard === expected ||
        heard.includes(expected) ||
        expected.includes(heard);
    }

    setPassed(localPassed);

    if (localPassed) {
      playCorrect();
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.7 },
        colors: ["#FFC84A", "#2E4BFF", "#FFE5A3"],
      });

      setFeedback(
        lang === "tl"
          ? `Magaling! Nasabi mo ang "${expectedSpeech}".`
          : `Great job! You said "${expectedSpeech}"!`
      );

      onComplete?.({
        lesson_id: activity.lesson_id,
        layout: "asr",
        lang,
        action: "speech_correct",
        passed: true,
        transcript: backendText,
        backend_text: backendText,
        model_used: res?.model_used || "faster-whisper",
        latency_ms: res?.latency_ms,
      });
    } else {
      //  Wrong — stay on this activity, count tries
      playWrong();
      setFeedback(lang === "tl" ? "Subukan muli!" : "Try again!");

      const newTries = tries + 1;
      setTries(newTries);
      if (newTries >= 3) setSkipVisible(true);

      // IMPORTANT: no onComplete here
    }
  } catch (err) {
    setFeedback(lang === "tl" ? "May error." : "Something went wrong.");
  } finally {
    setLoading(false);
  }
}


  // -----------------------------
  // Skip modal handlers (after 3 tries)
  // -----------------------------
  function handleSkipAfter3() {
    setSkipVisible(false);
    onComplete?.({ skipped: true }); // ActivityRunner goes to next activity
  }

  function handleRetryAfter3() {
    setSkipVisible(false);
    setTries(0);
    setFeedback("");
    setTranscript("");
  }

  // ---------------------------------------------
  // UI Layout
  // ---------------------------------------------
  return (
    <ActivityLayout>
      <div className="w-full flex flex-col items-center mt-10 px-4">
        {/* Instruction */}
        <div className="w-full max-w-3xl flex items-center gap-3 mb-4">
          <button
            onClick={playPrompt}
            className="flex items-center justify-center rounded-full bg-white shadow p-2 hover:scale-105"
          >
            <img src={soundIcon} alt="sound" className="w-8 h-8" />
          </button>

          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#1137A0]">
            {instruction}
          </h2>
        </div>

        {/* Prompt area */}
        <div className="relative w-full max-w-3xl mt-2">
          <div className="w-full h-[260px] sm:h-[280px] rounded-[32px] border-[6px] border-[#0052CC] bg-white flex items-center justify-center">
            {promptImage && (
              <img
                src={promptImage}
                alt="prompt"
                className="max-h-[210px] max-w-[260px] sm:max-w-[320px] object-contain"
              />
            )}
          </div>

          {/* Mic button with inside waveform */}
          <div className="absolute left-1/2 -bottom-10 -translate-x-1/2">
            <motion.button
              whileTap={{ scale: 0.9 }}
              disabled={loading}
              onClick={recording ? stopRecording : startRecording}
              className="relative w-[85px] h-[85px] rounded-full bg-[#FFC84A] shadow-xl border-4 border-white flex items-center justify-center"
            >
              {/* Waveform during recording */}
              {recording && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-end gap-[3px]">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-[6px] h-[20px] bg-[#2E4BFF] rounded-md animate-[asrPulse_0.9s_ease-in-out_infinite]"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Show mic icon when NOT recording */}
              {!recording && (
                <img src={micIcon} alt="mic" className="w-[32px] h-[32px]" />
              )}
            </motion.button>
          </div>
        </div>

        {/* Feedback */}
        <AnimatePresence>
          {feedback && (
            <motion.p
              key="fb"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`mt-16 text-lg font-semibold text-center ${
                passed ? "text-green-600" : "text-red-500"
              }`}
            >
              {feedback}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Hint */}
        <div className="mt-4 flex flex-col items-center gap-2">
          <HintButton icon={hintIcon} onClick={() => setShowHint(!showHint)} />

          <AnimatePresence>
            {showHint && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-white/95 border border-[#F9D678] rounded-xl px-4 py-3 text-sm sm:text-base shadow-md max-w-sm"
              >
                💡 {lang === "tl" ? "Ulitin ang salita." : "Repeat the word."}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Manual Skip button → immediate next activity */}
        <div className="mt-6">
          <SkipButton onClick={() => onComplete?.({ skipped: true })} />
        </div>
      </div>

      {/* Skip modal after 3 failed tries */}
      <SkipModal
        visible={skipVisible}
        onSkip={handleSkipAfter3}
        onRetry={handleRetryAfter3}
        lang={lang}
      />
    </ActivityLayout>
  );
}
