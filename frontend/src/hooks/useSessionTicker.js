// src/hooks/useSessionTicker.js
import { useEffect, useRef } from "react";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";

/**
 * Polls localStorage.hmh_session.endAt every 1s.
 * When expired:
 *  • calls /student/end-session (best-effort)
 *  • clears hmh_session
 *  • triggers onExpire()
 */
export default function useSessionTicker(onExpire) {
  const endedRef = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (endedRef.current) return;

      let sess = null;
      try {
        sess = JSON.parse(localStorage.getItem("hmh_session") || "null");
      } catch {
        // ignore parse errors
      }
      if (!sess || !sess.endAt || sess.status === "ended") return;

      if (Date.now() >= Number(sess.endAt)) {
        endedRef.current = true; // prevent multiple triggers

        try {
          await apiFetch("/student/end-session", {
            method: "POST",
            token: auth.token(),
            body: { session_id: sess.session_id },
          });
        } catch {
          // best-effort; even if this fails, we still clear locally
        }

        try {
          localStorage.removeItem("hmh_session");
        } catch {}
        onExpire?.();
      }
    };

    const id = setInterval(tick, 1000);

    // run once more when the tab hides (mobile background case)
    const onVis = () => {
      if (document.visibilityState === "hidden") tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [onExpire]);
}
