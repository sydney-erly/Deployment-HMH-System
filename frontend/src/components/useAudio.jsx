import { useRef, useCallback } from "react";
import { assetUrl } from "../lib/assets";

export default function useAudio() {
  const audioRef = useRef(null);

  const play = useCallback(async (path) => {
    try {
      const url = assetUrl(path);
      if (!url) return;
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  }, []);

  return play;
}
