// src/pages/TeacherStudentOverview.jsx
// updated 11/14/2025
import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";


/* ===== Design tokens ===== */
const P = { blue: "#2E4BFF", grayTrack: "#E5E7EB", ink: "#0F172A" };


/* ========= Half Gauge (SVG) ========= */
function HalfGauge({ value = 0, color = P.blue, track = P.grayTrack, height = 140 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));


  // SVG metrics tuned for card size
  const W = 320, H = 180, STROKE = 14, R = 70, CX = W / 2, CY = 120;
  const arc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const total = Math.PI * R;
  const filled = (pct / 100) * total;


  return (
    <div className="w-full max-w-full" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full block">
        {/* Track */}
        <path d={arc} fill="none" stroke={track} strokeWidth={STROKE} strokeLinecap="round" />
        {/* Fill */}
        <path
          d={arc}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${total - filled}`}
        />
        {/* Center label */}
        <text
          x={CX}
          y={CY - 6}
          textAnchor="middle"
          style={{ fontWeight: 800, fontSize: 20 }}
          fill={P.ink}
        >
          {Math.round(pct)}%
        </text>
      </svg>
    </div>
  );
}


export default function TeacherStudentOverview({ studentId, token }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`/teacher/student/${studentId}/overview`, { token });
        setSnapshot(res);
      } catch (e) {
        console.error("Failed to fetch overview:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId, token]);


  if (loading)
    return (
      <div className="flex items-center justify-center h-[40vh] text-gray-500">
        Loading overview...
      </div>
    );


  if (!snapshot) return <div className="text-gray-500 italic">No overview data available.</div>;


  const speechAcc = snapshot.speech_score ?? 0;
  const emotionAcc = snapshot.emotion_score ?? 0;


  return (
    <div className="flex flex-col gap-6 w-full max-w-full">
      {/* Keep same visual ratio but remove overflow at 1024px+ by using fr units */}
      <div className="grid lg:grid-cols-[2fr_1fr] gap-6 items-stretch w-full max-w-full">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Current Chapter + Current Lesson (unchanged breakpoints) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-w-0">
            <InfoCard
              label="Current Chapter"
              value={snapshot.current_chapter ? `${snapshot.current_chapter}` : "—"}
              subtext="Active learning stage"
            />
            <InfoCard
              label="Current Lesson"
              value={snapshot.current_lesson ? `${snapshot.current_lesson}` : "—"}
              subtext="Ongoing activity focus"
            />
          </div>


          {/* Last Session */}
          <LastSessionCard
            time={snapshot.last_session_time}
            end={snapshot.last_session_end}
            mood={snapshot.last_mood}
          />
        </div>


        {/* RIGHT COLUMN */}
        <div className="flex flex-col justify-between gap-6 min-w-0">
          <GaugeCard
            title="Speech Accuracy"
            value={speechAcc}
            subtitle="Average across recent lessons"
            color={P.blue}
          />
          <GaugeCard
            title="Emotion Mimic Accuracy"
            value={emotionAcc}
            subtitle="Facial emotion matching performance"
            color="#FFC84A"
          />
        </div>
      </div>
    </div>
  );
}


/* ---------- Info Card ---------- */
function InfoCard({ label, value, subtext }) {
  return (
    <div className="bg-[#F9FAFB] border border-gray-200 rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-200 min-h-[220px] h-full w-full max-w-full overflow-hidden">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-gray-500 mb-1">{label}</h3>
        <div className="text-3xl font-extrabold text-[#2E4bff] mb-1 break-words">{value}</div>
      </div>
      <p className="text-sm text-gray-500 break-words">{subtext}</p>
    </div>
  );
}


/* ---------- Last Session Card ---------- */
function LastSessionCard({ time, end, mood }) {
  const startTime = time
    ? new Date(time).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "—";
  const endTime = end
    ? new Date(end).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "—";


  return (
    <div className="bg-[#F9FAFB] border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-200 min-h-[190px] h-full w-full max-w-full overflow-hidden">
      <h3 className="text-sm font-semibold text-gray-500 mb-3">Last Session</h3>


      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full h-auto text-sm text-gray-700">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="pb-2 text-left font-semibold text-gray-500">Started At</th>
              <th className="pb-2 text-left font-semibold text-gray-500">Ended At</th>
              <th className="pb-2 text-left font-semibold text-gray-500">Mood</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="pt-2 font-medium text-[#2E4bff] break-words">{startTime}</td>
              <td className="pt-2 font-medium text-[#2E4bff] break-words">{endTime}</td>
              <td className="pt-2 font-medium text-[#2E4bff] break-words">
                {mood && mood !== "" ? mood : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}


/* ---------- Gauge Card (uses SVG HalfGauge) ---------- */
function GaugeCard({ title, value = 0, subtitle, color }) {
  return (
    <div className="bg-[#F9FAFB] border border-gray-200 rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-200 min-h-[220px] h-full w-full max-w-full overflow-hidden">
      <h3 className="text-sm font-semibold text-gray-500 mb-2 text-center">{title}</h3>
      <HalfGauge value={value} color={color} height={130} />
      <p className="text-sm text-gray-500 text-center mt-1 break-words">{subtitle}</p>
    </div>
  );
}







