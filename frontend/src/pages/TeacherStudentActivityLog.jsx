// src/pages/TeacherStudentActivityLog.jsx
// updated 11/14/2025
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { FiClock, FiSearch } from "react-icons/fi";
import { GoHome } from "react-icons/go";
import { PiStudentBold } from "react-icons/pi";
import { SiGoogleanalytics } from "react-icons/si";


/**
 * Props:
 *  - studentId: UUID string
 *  - token: auth token
 */
export default function TeacherStudentActivityLog({ studentId, token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState("ALL"); // ALL | LESSON | EMOTION | SPEECH


  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // Try main activity endpoint first
        let res = await apiFetch(`/teacher/student/${studentId}/activity`, { token });


        if (!Array.isArray(res) || !res.length) {
          // fallback: fetch overview + progress
          const [ov, pr] = await Promise.all([
            apiFetch(`/teacher/student/${studentId}/overview`, { token }),
            apiFetch(`/teacher/student/${studentId}/progress`, { token }),
          ]);


          const synth = [];


          // Session data
          if (ov?.last_session_time) {
            synth.push({
              type: "SESSION",
              ts: ov.last_session_time,
              title: "Session started",
              detail: ov.last_mood ? `Mood: ${ov.last_mood}` : "",
              duration_sec: ov.last_session_end
                ? Math.max(0, (new Date(ov.last_session_end) - new Date(ov.last_session_time)) / 1000)
                : undefined,
            });
          }


          // Lessons
          (pr?.lesson_avg ?? []).forEach((r) => {
            synth.push({
              type: "LESSON",
              ts: r.date || r.day || r.ts || new Date().toISOString(),
              title: `Completed Lesson ${r.lesson ?? ""}`.trim(),
              detail: r.chapter ? `Chapter ${r.chapter}` : "Lesson completed",
              score: typeof r.avg === "number" ? Math.round(r.avg) : undefined,
            });
          });


          // Speech practice
          (pr?.speech ?? []).forEach((r) => {
            synth.push({
              type: "SPEECH",
              ts: r.date || r.day || r.ts || new Date().toISOString(),
              title: "Speech practice",
              detail: "Pronunciation accuracy",
              score: typeof r.avg === "number" ? Math.round(r.avg) : undefined,
            });
          });


          // Emotion recognition
          const emoSrc = (pr?.emotion_trend?.length ? pr.emotion_trend : pr?.emotion) ?? [];
          emoSrc.forEach((r) => {
            synth.push({
              type: "EMOTION",
              ts: r.date || r.day || r.ts || new Date().toISOString(),
              title: "Emotion recognition",
              detail: "Facial mimic accuracy",
              score: typeof r.avg === "number" ? Math.round(r.avg) : undefined,
            });
          });


          // Sort by newest first
          res = synth.sort((a, b) => new Date(b.ts) - new Date(a.ts));
        }


        if (alive) setItems(res);
      } catch (e) {
        console.error("Failed to fetch activity log:", e);
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();


    return () => {
      alive = false;
    };
  }, [studentId, token]);


  // ---- Filters & grouping ----
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items
      .filter((it) => type === "ALL" || it.type === type)
      .filter((it) =>
        !qq
          ? true
          : [it.title, it.detail, it.type].filter(Boolean).some((s) => String(s).toLowerCase().includes(qq))
      )
      .sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }, [items, type, q]);


  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((it) => {
      const d = new Date(it.ts);
      const key = d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(it);
    });
    return Array.from(map.entries());
  }, [filtered]);


  return (
    <div className="flex flex-col gap-4">
      {/* Header / Controls */}
      <div
        className={
          "flex flex-col md:flex-row md:items-center md:justify-between gap-3 " +
          "md:bg-white md:rounded-2xl md:p-4 md:border md:border-gray-200 md:shadow-sm"
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-600">Filter:</span>
          <Toggle value={type} onChange={setType} />
        </div>


        <div className="relative w-full md:w-1/2">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, type, details…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-[#2E4bff] outline-none text-sm"
          />
        </div>
      </div>


      {/* Body */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        {loading ? (
          <div className="p-8 text-gray-500">Loading activity…</div>
        ) : groups.length === 0 ? (
          <div className="p-8 text-gray-400 italic">No activity yet.</div>
        ) : (
          <div className="divide-y">
            {groups.map(([dateLabel, rows], gi) => (
              <section key={gi} className="p-4">
                <h3 className="text-sm font-semibold text-gray-500 mb-3">{dateLabel}</h3>
                <ul className="flex flex-col gap-3">
                  {rows.map((it, i) => (
                    <ActivityRow key={`${gi}-${i}`} item={it} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


/* ---------- UI Bits ---------- */


function Toggle({ value, onChange }) {
  const options = [
    { key: "ALL", label: "All" },
    { key: "LESSON", label: "Lessons" },
    { key: "SPEECH", label: "Speech" },
    { key: "EMOTION", label: "Emotion" },
  ];
  return (
    <div className="bg-[#F6F7FB] border border-gray-200 rounded-xl p-1 flex">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              active ? "bg-[#2E4bff] text-white" : "text-gray-600 hover:bg-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}


function ActivityRow({ item }) {
  const time = new Date(item.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const chip = (label) => (
    <span className="px-2 py-0.5 text-xs rounded-lg border bg-[#F9FAFB] text-gray-700">{label}</span>
  );


  const icon = (() => {
    switch (item.type) {
      case "LESSON": return <SiGoogleanalytics className="text-[#2E4bff]" />;
      case "SPEECH": return <PiStudentBold className="text-[#2E4bff]" />;
      case "EMOTION": return <GoHome className="text-[#2E4bff]" />;
      case "SESSION": return <FiClock className="text-[#2E4bff]" />;
      default: return <FiClock className="text-[#2E4bff]" />;
    }
  })();


  return (
    <li className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-[#EAF0FF] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div className="min-w-0">
            <div className="font-semibold text-[#111] truncate">{item.title || item.type}</div>
            {item.detail && <div className="text-sm text-gray-600 truncate">{item.detail}</div>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {typeof item.score === "number" && chip(`Score ${item.score}%`)}
            {typeof item.duration_sec === "number" && chip(`${Math.round(item.duration_sec / 60)}m`)}
            <span className="text-xs text-gray-500">{time}</span>
          </div>
        </div>
      </div>
    </li>
  );
}







