import React, { useRef } from "react";
import { Volume2 } from "lucide-react";

export default function SpeakerButton({ src }) {
  const audioRef = useRef(null);

  const play = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = new Audio(src);
    audioRef.current.play().catch((err) => console.error("Play failed", err));
  };

  return (
    <button
      onClick={play}
      className="hmh-btn hmh-btn-play flex items-center gap-2"
    >
      <Volume2 size={24} />
      <span>Play</span>
    </button>
  );
}
