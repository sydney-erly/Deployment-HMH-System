// src/pages/TeacherStudentActivityLog.jsx
// updated with Lesson drilldown modal (question | spiral_tag | attempts | score | average)
// updated 12/02/2025

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { FiClock, FiSearch } from "react-icons/fi";
import { IoHappyOutline } from "react-icons/io5";
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

  // 🔹 New: state for lesson drilldown modal
  const [lessonTable, setLessonTable] = useState(null);
  const [lessonLoading, setLessonLoading] = useState(false);

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
                ? Math.max(
                    0,
                    (new Date(ov.last_session_end) -
                      new Date(ov.last_session_time)) /
                      1000
                  )
                : undefined,
            });
          }

          // Lessons (from lesson_avg)
          (pr?.lesson_avg ?? []).forEach((r) => {
            synth.push({
              type: "LESSON",
              ts: r.date || r.day || r.ts || new Date().toISOString(),
              title: `Completed Lesson ${r.lesson ?? ""}`.trim(),
              detail: r.chapter ? `Chapter ${r.chapter}` : "Lesson completed",
              score:
                typeof r.avg === "number" ? Math.round(r.avg) : undefined,
              // no lesson_id here because this is just fallback mode
            });
          });

          // Speech practice
          (pr?.speech ?? []).forEach((r) => {
            synth.push({
              type: "SPEECH",
              ts: r.date || r.day || r.ts || new Date().toISOString(),
              title: "Speech practice",
              detail: "Pronunciation accuracy",
              score:
                typeof r.avg === "number" ? Math.round(r.avg) : undefined,
            });
          });

          // Emotion recognition
          const emoSrc =
            (pr?.emotion_trend?.length ? pr.emotion_trend : pr?.emotion) ??
            [];
          emoSrc.forEach((r) => {
            synth.push({
              type: "EMOTION",
              ts: r.date || r.day || r.ts || new Date().toISOString(),
              title: "Emotion recognition",
              detail: "Facial mimic accuracy",
              score:
                typeof r.avg === "number" ? Math.round(r.avg) : undefined,
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

  // 🔹 Handler: load lesson table when a completed lesson is clicked
  async function handleLessonClick(item) {
    const lessonId = item.lesson_id; // comes from backend activity route
    if (!lessonId) {
      console.warn("Lesson click without lesson_id, ignoring.", item);
      return;
    }
    setLessonLoading(true);
    try {
      const res = await apiFetch(
        `/teacher/student/${studentId}/lesson/${lessonId}/table`,
        { token }
      );
      setLessonTable(res);
    } catch (e) {
      console.error("Failed to fetch lesson table:", e);
      alert("Could not load lesson details. Please try again.");
    } finally {
      setLessonLoading(false);
    }
  }

  // ---- Filters & grouping ----
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items
      .filter((it) => type === "ALL" || it.type === type)
      .filter((it) =>
        !qq
          ? true
          : [it.title, it.detail, it.type]
              .filter(Boolean)
              .some((s) => String(s).toLowerCase().includes(qq))
      )
      .sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }, [items, type, q]);

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((it) => {
      const d = new Date(it.ts);
      const key = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
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
                <h3 className="text-sm font-semibold text-gray-500 mb-3">
                  {dateLabel}
                </h3>
                <ul className="flex flex-col gap-3">
                  {rows.map((it, i) => (
                    <ActivityRow
                      key={`${gi}-${i}`}
                      item={it}
                      onLessonClick={handleLessonClick}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* 🔹 Lesson drilldown modal */}
      {lessonTable && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-6">
            <h2 className="text-2xl font-bold mb-4">
              Lesson {lessonTable.lesson_id} – Activity Breakdown
            </h2>

            {lessonLoading && (
              <div className="text-sm text-gray-500 mb-3">
                Loading lesson details…
              </div>
            )}

            {/* Excel-style layout */}
            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-6 text-xs font-semibold bg-gray-100 border-b">
                <div className="p-2">Activity</div>
                <div className="p-2 col-span-2">Question</div>
                <div className="p-2">Spiral Tag</div>
                <div className="p-2 text-center">Attempts</div>
                <div className="p-2 text-center">Score / Avg</div>
              </div>

              {lessonTable.rows && lessonTable.rows.length > 0 ? (
                lessonTable.rows.map((row, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-6 text-sm border-b last:border-b-0 hover:bg-gray-50"
                  >
                    <div className="p-2 font-medium">Activity {i + 1}</div>
                    <div className="p-2 col-span-2">
                      {row.question || "—"}
                    </div>
                    <div className="p-2">
                      {row.spiral_tag && row.spiral_tag !== ""
                        ? row.spiral_tag
                        : "—"}
                    </div>
                    <div className="p-2 text-center">{row.attempts}</div>
                    <div className="p-2 text-center">
                      {row.score != null ? Math.round(row.score) : "—"} /{" "}
                      {row.average != null ? row.average.toFixed?.(1) ?? row.average : "—"}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-4 text-sm text-gray-500">
                  No attempts yet for this lesson.
                </div>
              )}
            </div>

            {/* Footer overall average */}
            {lessonTable.rows && lessonTable.rows.length > 0 && (
              <div className="flex justify-end mt-4 text-base font-bold text-blue-600">
                Lesson Avg:&nbsp;
                {(() => {
                  const vals = lessonTable.rows
                    .map((r) => r.average)
                    .filter((v) => typeof v === "number");
                  if (!vals.length) return "—";
                  const sum = vals.reduce((a, b) => a + b, 0);
                  return `${(sum / vals.length).toFixed(1)}%`;
                })()}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setLessonTable(null)}
                className="px-5 py-2 bg-[#2E4bff] text-white rounded-lg hover:brightness-110 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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
              active
                ? "bg-[#2E4bff] text-white"
                : "text-gray-600 hover:bg-white"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ActivityRow({ item, onLessonClick }) {
  const time = new Date(item.ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const chip = (label) => (
    <span className="px-2 py-0.5 text-xs rounded-lg border bg-[#F9FAFB] text-gray-700">
      {label}
    </span>
  );

  const icon = (() => {
    switch (item.type) {
      case "LESSON":
        return <SiGoogleanalytics className="text-[#2E4bff]" />;
      case "SPEECH":
        return <PiStudentBold className="text-[#2E4bff]" />;
      case "EMOTION":
        return <IoHappyOutline className="text-[#2E4bff]" />;
      case "SESSION":
        return <FiClock className="text-[#2E4bff]" />;
      default:
        return <FiClock className="text-[#2E4bff]" />;
    }
  })();

  const clickable = item.type === "LESSON";

  const handleClick = () => {
    if (clickable && typeof onLessonClick === "function") {
      onLessonClick(item);
    }
  };

  return (
    <li
      className={`flex items-start gap-3 ${
        clickable ? "cursor-pointer hover:bg-gray-50 rounded-xl p-2 -m-2" : ""
      }`}
      onClick={handleClick}
    >
      <div className="w-9 h-9 rounded-xl bg-[#EAF0FF] flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div className="min-w-0">
            <div className="font-semibold text-[#111] truncate">
              {item.title || item.type}
            </div>
            {item.detail && (
              <div className="text-sm text-gray-600 truncate">
                {item.detail}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {typeof item.score === "number" && chip(`Score ${item.score}%`)}
            {typeof item.duration_sec === "number" &&
              chip(`${Math.round(item.duration_sec / 60)}m`)}
            <span className="text-xs text-gray-500">{time}</span>
          </div>
        </div>
      </div>
    </li>
  );
}
