// src/pages/TeacherStudentReportsTab.jsx
// updated 11/14/2025


// On-screen student progress tab (NO activity-level correctness chart)
// Single header + aligned icon-only Download button


import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "../lib/api";
import generateStudentReportPdf from "../lib/studentReportPdf";
import { FiDownload } from "react-icons/fi";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
} from "recharts";


/* ====== Design tokens ====== */
const P = {
  blue: "#2E4BFF",
  yellow: "#FFC84A",
  ink: "#0F172A",
  grayInk: "#64748B",
  grid: "#E5E7EB",
  card: "bg-white rounded-2xl shadow-sm border border-gray-200",
};


const fmtPct = (v) => `${Number(v ?? 0).toFixed(0)}%`;
const fmtMins = (v) => `${Number(v ?? 0).toFixed(0)} min`;


/* ========= Reusable UI ========= */
function ChartCard({ title, children, className = "" }) {
  return (
    <div className={`${P.card} overflow-hidden ${className}`}>
      <div className="flex items-center justify-between bg-[#2E4bff] text-white px-4 py-2">
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="p-4 h-[300px]">{children}</div>
    </div>
  );
}


function Section({ title, children }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-black">{title}</h2>
      {children}
    </section>
  );
}


function EmptyState() {
  return (
    <div className="flex items-center justify-center h-full text-gray-400 italic">
      No data yet
    </div>
  );
}


/* ========= Half Gauge (SVG) ========= */
function HalfGauge({ value = 0, color = P.blue, track = "#E6E9F2" }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const W = 520,
    H = 260,
    STROKE = 14,
    R = 110,
    CX = W / 2,
    CY = 200;
  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  const total = Math.PI * R;
  const filled = (pct / 100) * total;
  return (
    <div className="w-full h-[220px] flex items-center justify-center">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
        <path
          d={arcPath}
          fill="none"
          stroke={track}
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${total - filled}`}
        />
        <text
          x={CX}
          y={CY - 10}
          textAnchor="middle"
          style={{ fontWeight: 700, fontSize: 18 }}
          fill="#0F172A"
        >
          {Math.round(pct)}%
        </text>
      </svg>
    </div>
  );
}


/* ========= Main ========= */
/**
 * Props:
 * - studentId: UUID
 * - token: auth token
 * - showTopBar?: boolean (default true) — show local header row
 * - showDownloadButton?: boolean (default true)
 */
export default function TeacherStudentReportsTab({
  studentId,
  token,
  showTopBar = true,
  showDownloadButton = true,
}) {
  const [student, setStudent] = useState(null);
  const [progress, setProgress] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    (async () => {
      try {
        const [s, p, r] = await Promise.all([
          apiFetch(`/teacher/student/${studentId}`, { token }),
          apiFetch(`/teacher/student/${studentId}/progress`, { token }),
          apiFetch(`/teacher/student/${studentId}/recommendations`, { token }),
        ]);
        setStudent(s);
        setProgress(p);
        setRecommendations(r?.recommendations ?? {});
      } catch (e) {
        console.error("Failed to fetch report data:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId, token]);


  const speechAvg = useMemo(() => {
    const arr = progress?.speech?.map((d) => d.avg ?? 0) ?? [];
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  }, [progress]);


  const emotionAvg = useMemo(() => {
    const src =
      (progress?.emotion_trend?.length ? progress.emotion_trend : progress?.emotion) ?? [];
    const arr = src.map((d) => d.avg ?? 0);
    return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
  }, [progress]);


  async function handleDownloadPdf() {
    if (!student || !progress) return;
    try {
      await generateStudentReportPdf({ student, progress, recommendations });
    } catch (e) {
      console.error("PDF generation failed:", e);
      alert("Failed to generate PDF. See console for details.");
    }
  }


  if (loading)
    return <div className="flex items-center justify-center h-[40vh] text-gray-500">Loading progress data...</div>;


  if (!progress)
    return <div className="text-gray-500 italic text-center mt-8">No progress report available yet.</div>;


  return (
    <div className="space-y-8">
      {/* === Local Header: Title + Icon Button (aligned) === */}
      {showTopBar && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[#111]">Student Progress Report</h2>
          {showDownloadButton && (
            <button
              onClick={handleDownloadPdf}
              className="p-3 rounded-full bg-[#2E4bff] text-white hover:brightness-110 transition"
              title="Download PDF"
            >
              <FiDownload className="text-xl" />
            </button>
          )}
        </div>
      )}


      {/* === Summary Metric Section === */}
      <Section title="Summary Metric Section">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <ChartCard title="Overall Speech Accuracy (%)">
            <HalfGauge value={speechAvg} color={P.blue} />
          </ChartCard>


          <ChartCard title="Overall Emotion Mimic Accuracy (%)">
            <HalfGauge value={emotionAvg} color={P.yellow} />
          </ChartCard>


          <ChartCard title="Minutes per Session">
            {progress.engagement?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progress.engagement} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={P.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: P.grayInk, fontSize: 12 }} />
                  <YAxis tick={{ fill: P.grayInk, fontSize: 12 }} tickFormatter={(v) => `${v}`} />
                  <Tooltip formatter={(v) => [fmtMins(v), "Avg duration"]} labelStyle={{ color: P.grayInk }} />
                  <Line type="monotone" dataKey="value" stroke={P.blue} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        </div>
      </Section>


      {/* === Speech Performance === */}
      <Section title="Speech Performance">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ChartCard title="Letter/Word Accuracy">
            {progress.letter_accuracy?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progress.letter_accuracy} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={P.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: P.grayInk, fontSize: 12 }} />
                  <YAxis tick={{ fill: P.grayInk, fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => [fmtPct(v), "Accuracy"]} />
                  <Bar dataKey="acc" barSize={28} radius={[8, 8, 0, 0]}>
                    {progress.letter_accuracy.map((_, i) => (
                      <Cell key={i} fill={P.blue} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>


          <ChartCard title="Pronunciation Accuracy Trend">
            {progress.speech?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progress.speech} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={P.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: P.grayInk, fontSize: 12 }} />
                  <YAxis tick={{ fill: P.grayInk, fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => [fmtPct(v), "Average"]} />
                  <Line type="monotone" dataKey="avg" stroke={P.blue} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        </div>


        {/* Words Mastery */}
        <div className={`${P.card} overflow-hidden mt-5`}>
          <div className="bg-[#2E4bff] text-white px-5 py-2 text-sm font-semibold rounded-t-2xl">
            Words Mastery Overview
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <WordPills title="Mastered Words" items={progress.mastered_words} pillClass="bg-green-100 text-green-700 border border-green-200" />
            <WordPills title="Needs Practice" items={progress.needs_practice_words} pillClass="bg-rose-100 text-rose-700 border border-rose-200" />
          </div>
        </div>
      </Section>


      {/* === Emotion Performance === */}
      <Section title="Emotion Performance">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Emotion Accuracy Breakdown">
            {progress.emotion_breakdown?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={progress.emotion_breakdown} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={P.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="emotion" tick={{ fill: P.grayInk, fontSize: 12 }} />
                  <YAxis tick={{ fill: P.grayInk, fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => [fmtPct(v), "Match"]} />
                  <Bar dataKey="avg_match" barSize={28} radius={[8, 8, 0, 0]}>
                    {progress.emotion_breakdown.map((_, i) => (
                      <Cell key={i} fill={P.yellow} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>


          <ChartCard title="Emotion Improvement Trend">
            {(progress.emotion_trend?.length || progress.emotion?.length) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progress.emotion_trend?.length ? progress.emotion_trend : progress.emotion} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={P.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fill: P.grayInk, fontSize: 12 }} />
                  <YAxis tick={{ fill: P.grayInk, fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => [fmtPct(v), "Average"]} />
                  <Line type="monotone" dataKey="avg" stroke={P.yellow} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </ChartCard>
        </div>
      </Section>


      {/* === Recommendations === */}
      <Section title="Recommendations">
        <div className={`${P.card} p-5`}>
          {recommendations ? (
            <ul className="list-disc pl-6 space-y-1 text-slate-700">
              <li>Next Lessons: {recommendations.next_lessons?.length ? recommendations.next_lessons.join(", ") : "—"}</li>
              <li>Focus Areas: {recommendations.focus_areas?.length ? recommendations.focus_areas.join(", ") : "—"}</li>
              <li>Remark: <strong>{recommendations.remark || "No remark"}</strong></li>
            </ul>
          ) : (
            <EmptyState />
          )}
        </div>
      </Section>
    </div>
  );
}


/* ====== helpers ====== */
function WordPills({ title, items = [], pillClass = "" }) {
  return (
    <div>
      <h4 className="font-semibold mb-2 text-slate-700">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.length ? (
          items.map((w, i) => (
            <span key={i} className={`px-2 py-1 text-xs rounded-full ${pillClass}`}>
              {w}
            </span>
          ))
        ) : (
          <span className="text-gray-400 italic text-sm">No data yet</span>
        )}
      </div>
    </div>
  );
}







