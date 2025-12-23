// src/pages/TeacherAnalytics.jsx
// updated 11/14/2025
import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import hmhIcon from "../assets/hmh_icon.png";
import { FiLogOut } from "react-icons/fi";
import { GoHome } from "react-icons/go";
import { PiStudentBold } from "react-icons/pi";
import { SiGoogleanalytics } from "react-icons/si";
import { MdMenuBook } from "react-icons/md";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, Cell, ReferenceLine
} from "recharts";


/* ========= Labels, formatters, palette ========= */
const SERIES_LABEL = {
  avg_match: "Match %",
  session_count: "Sessions",
  avg_duration_min: "Avg Duration (min)",
  speech_avg: "Speech Accuracy",
  emotion_match: "Emotion Match %",
  avg_accuracy: "Average Score",
};
const fmtPercent = v => (v == null || isNaN(v) ? "—" : `${Number(v).toFixed(1)}%`);
const fmtInt = v => (v == null || isNaN(v) ? "—" : String(Math.round(v)));
const fmtOneDecimal = v => (v == null || isNaN(v) ? "—" : Number(v).toFixed(1));
const palette = {
  blue: "#2E4bff", red: "#E65460", yellow: "#FFC84A", green: "#22C55E",
  gray: "#EAE4D0", grid: "#EEF0F4", axis: "#DDE1E7", text: "#6b7280",
};


/* ========= Week label formatter ========= */
function formatIsoWeek(iso) {
  if (!iso || !iso.includes("-")) return iso;
  const [y, w] = iso.split("-").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day + 1 + (w - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const start = monday.toLocaleString("en-US", { month: "short", day: "numeric" });
  const endDay = sunday.getUTCDate();
  return `${start}–${endDay}`;
}


/* ========= Score → color ========= */
function colorForScore(v) {
  const x = Number(v);
  if (!isFinite(x)) return palette.gray;
  if (x < 60) return "#F87171";
  if (x < 80) return "#FBBF24";
  return "#34D399";
}


/* ========= Tooltip formatter ========= */
function makeTooltipFormatter({ percentKeys = [], intKeys = [] } = {}) {
  return (value, name) => {
    const label = SERIES_LABEL[name] || name;
    if (percentKeys.includes(name)) return [fmtPercent(value), label];
    if (intKeys.includes(name)) return [fmtInt(value), label];
    return [fmtOneDecimal(value), label];
  };
}


const defaultLabelFormatter = (label) => label || "";


/* ========= Tooltip UI ========= */
function CardTooltip({ active, label, payload, titleFormatter, formatter }) {
  if (!active || !payload || !payload.length) return null;
  const niceTitle = titleFormatter ? titleFormatter(label, payload) : label;
  return (
    <div style={{
      background: "white", border: "1px solid #E5E7EB", borderRadius: 10,
      boxShadow: "0 6px 16px rgba(16,24,40,0.08)", padding: "10px 12px",
      fontSize: 12, color: "#111", minWidth: 160
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{niceTitle}</div>
      <div style={{ display: "grid", gap: 4 }}>
        {payload.map((row, i) => {
          const [val, name] = formatter ? formatter(row.value, row.name, row) : [row.value, row.name];
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: 999,
                background: row.color || row.stroke || "#888",
                border: "1px solid #fff", boxShadow: "0 0 0 1px rgba(0,0,0,0.06)"
              }} />
              <span style={{ color: palette.text, flex: 1 }}>{name}</span>
              <span style={{ fontWeight: 600 }}>{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ========= Legend ========= */
function ScoreLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-500">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#F87171]" /> 0–59
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#FBBF24]" /> 60–79
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#34D399]" /> 80–100
      </span>
    </div>
  );
}


/* ========= Dot Renderer ========= */
function RoundDot({ cx, cy, r = 6, fill = "#000", stroke = "#fff", strokeWidth = 2, nudgeUpIfOnZero = false }) {
  if (cx == null || cy == null) return null;
  const x = Math.round(cx) + 0.5;
  const y = Math.round(cy) + 0.5 - (nudgeUpIfOnZero ? 0.75 : 0);
  return (
    <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
  );
}


/* ========= FIXED EmptyState (centered) ========= */
function EmptyState({ label }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-gray-400 italic pointer-events-none">
      <span className="text-sm">{label || "No analytics data yet"}</span>
    </div>
  );
}


export default function TeacherAnalytics() {
  const nav = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const token = auth.token();


  /* ========= Load data ========= */
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/teacher/analytics", { token });
        setData(res);
      } catch (e) {
        console.error("Failed to fetch analytics:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line


  /* ========= Background ========= */
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#F6F7FB";
    return () => (document.body.style.backgroundColor = prev);
  }, []);


  /* ========= Scroll lock ========= */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = navOpen ? "hidden" : prev || "";
    return () => (document.body.style.overflow = prev);
  }, [navOpen]);


  /* ========= Engagement ========= */
  const engagement = Array.isArray(data?.engagement) ? data.engagement : [];
  const maxSessions = useMemo(
    () => Math.max(1, ...engagement.map((d) => Number(d.session_count) || 0)),
    [engagement]
  );


  const yTicksEngagement = useMemo(() => {
    const t = [];
    for (let i = 0; i <= maxSessions; i++) t.push(i);
    return t;
  }, [maxSessions]);


  /* ========= Drawer Swipe ========= */
  const EDGE_WIDTH = 24;
  const OPEN_THRESHOLD = 80;
  const CLOSE_THRESHOLD = -80;


  function onEdgeTouchStart(e) {
    if (navOpen) return;
    const t = e.touches?.[0];
    if (!t || t.clientX > EDGE_WIDTH) return;
    draggingRef.current = true;
    startXRef.current = t.clientX;
    setDragX(0);
  }


  function onEdgeTouchMove(e) {
    if (!draggingRef.current || navOpen) return;
    const t = e.touches?.[0];
    if (!t) return;
    const delta = Math.max(0, t.clientX - startXRef.current);
    setDragX(delta);
  }


  function onEdgeTouchEnd() {
    if (!draggingRef.current || navOpen) return;
    draggingRef.current = false;
    if (dragX > OPEN_THRESHOLD) setNavOpen(true);
    setDragX(0);
  }


  function onDrawerTouchStart(e) {
    const t = e.touches?.[0];
    if (!t) return;
    draggingRef.current = true;
    startXRef.current = t.clientX;
    setDragX(0);
  }


  function onDrawerTouchMove(e) {
    if (!draggingRef.current) return;
    const t = e.touches?.[0];
    if (!t) return;
    const delta = t.clientX - startXRef.current;
    setDragX(Math.min(0, delta));
  }


  function onDrawerTouchEnd() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragX < CLOSE_THRESHOLD) setNavOpen(false);
    setDragX(0);
  }


  /** ========= Drawer Styles ========= */
  const drawerStyle = {};
  let drawerClasses =
    "fixed inset-y-0 left-0 w-64 bg-[#2E4bff] text-white p-6 flex flex-col z-50 shadow-lg transition-transform duration-200 ease-out";


  if (navOpen) {
    const px = Math.min(0, dragX);
    drawerStyle.transform = `translateX(${px}px)`;
  } else if (!navOpen && dragX > 0) {
    drawerStyle.transform = `translateX(calc(-100% + ${dragX}px))`;
  } else {
    drawerClasses += " -translate-x-full";
  }


  return (
    <div className="min-h-[100dvh] bg-[#F6F7FB] flex lg:pl-64">


      {/* Sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-64 bg-[#2E4bff] text-white px-6 py-8 flex flex-col justify-between shadow-lg">
        <div>
          <div className="flex flex-col items-center mb-8">
            <img src={hmhIcon} alt="HearMyHeart Icon" className="w-auto h-18 mb-3 object-contain" />
            <div className="text-2xl font-bold">HearMyHeart</div>
          </div>
          <SidebarLinks location={location} />
        </div>
        <div className="pt-2 border-t border-white/20 flex justify-center">
          <button
            className="p-3 rounded-full hover:bg-white/10"
            onClick={() => { auth.signout(); nav("/login"); }}
          >
            <FiLogOut className="text-2xl rotate-180" />
          </button>
        </div>
      </aside>


      {/* Mobile Drawer */}
      {!navOpen && (
        <div
          className="lg:hidden fixed inset-y-0 left-0 w-6 z-40"
          onTouchStart={onEdgeTouchStart}
          onTouchMove={onEdgeTouchMove}
          onTouchEnd={onEdgeTouchEnd}
        />
      )}


      <div
        className={`lg:hidden ${drawerClasses}`}
        style={drawerStyle}
        onTouchStart={onDrawerTouchStart}
        onTouchMove={onDrawerTouchMove}
        onTouchEnd={onDrawerTouchEnd}
      >
        <div className="flex flex-col items-center mb-6">
          <img src={hmhIcon} alt="HearMyHeart Icon" className="w-auto h-15 mb-2 object-contain" />
          <div className="text-2xl font-bold">HearMyHeart</div>
        </div>


        <SidebarLinks location={location} />
      </div>


      {navOpen && <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setNavOpen(false)} />}


      {/* Main Content */}
      <main className="flex-1 px-6 md:px-10 lg:px-16 py-8 overflow-y-auto text-[#111]">
        <div className="max-w-9xl">
          <h1 className="text-3xl font-bold mb-6 text-[#1C4211]">Analytics</h1>


          {/* GRID: 2 | 1 | 2 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">


            {/* Row 1 */}
            <SquareCard title="Emotion Match Rate" desc="Percentage of attempts with correct emotion identification." legend={<ScoreLegend />}>
              {loading ? (
                <EmptyState label="Loading..." />
              ) : data?.emotion_distribution?.length ? (
                <BarChart data={data.emotion_distribution} margin={{ top: 8, right: 12, left: 16, bottom: 18 }}>
                  <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="emotion" tick={{ fill: palette.text, fontSize: 12 }} axisLine={{ stroke: palette.axis }} tickLine={false} tickMargin={6} />
                  <YAxis width={28} tick={{ fill: palette.text, fontSize: 12 }} axisLine={{ stroke: palette.axis }} tickLine={false} tickMargin={6} padding={{ bottom: 6 }} domain={[0, 100]} />
                  <Tooltip content={<CardTooltip formatter={makeTooltipFormatter({ percentKeys: ["avg_match"] })} titleFormatter={defaultLabelFormatter} />} />
                  <Bar dataKey="avg_match" maxBarSize={28} radius={[8, 8, 0, 0]}>
                    {data.emotion_distribution.map((row, i) => (
                      <Cell key={i} fill={colorForScore(row.avg_match)} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <EmptyState />
              )}
            </SquareCard>


            <SquareCard title="Sessions per Student" desc="Number of sessions per student in the last 30 days.">
              {loading ? (
                <EmptyState label="Loading..." />
              ) : engagement.length ? (
                <LineChart data={engagement} margin={{ top: 8, right: 12, left: 16, bottom: 26 }}>
                  <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="student" hide tickLine={false} />
                  <YAxis
                    width={28}
                    ticks={yTicksEngagement}
                    domain={[0, yTicksEngagement[yTicksEngagement.length - 1] || 1]}
                    allowDecimals={false}
                    tick={{ fill: palette.text, fontSize: 12 }}
                    axisLine={{ stroke: palette.axis }}
                    tickLine={false}
                    tickFormatter={fmtInt}
                    tickMargin={6}
                  />
                  <Tooltip
                    content={
                      <CardTooltip
                        formatter={(v, n) =>
                          n === "session_count"
                            ? [fmtInt(v), SERIES_LABEL[n]]
                            : [fmtOneDecimal(v), SERIES_LABEL[n]]
                        }
                        titleFormatter={(_, payload) => payload?.[0]?.payload?.student || ""}
                      />
                    }
                  />


                  <ReferenceLine y={0} stroke={palette.axis} />


                  <Line
                    type="monotone"
                    dataKey="session_count"
                    stroke={palette.blue}
                    strokeWidth={3}
                    dot={(p) => <RoundDot {...p} r={4} fill={palette.blue} />}
                    activeDot={(p) => <RoundDot {...p} r={6} fill={palette.blue} />}
                  />


                  <Line
                    type="monotone"
                    dataKey="avg_duration_min"
                    stroke={palette.yellow}
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={(p) => <RoundDot {...p} r={6} fill={palette.yellow} nudgeUpIfOnZero />}
                    activeDot={(p) => <RoundDot {...p} r={7} fill={palette.yellow} nudgeUpIfOnZero />}
                  />
                </LineChart>
              ) : (
                <EmptyState />
              )}
            </SquareCard>


            {/* Row 2 Wide */}
            <WideCard
              title="Students Weekly Progress in Speech & Emotion"
              desc="Weekly trends in speech accuracy and emotion match rate."
              legend={<ScoreLegend />}
              className="md:col-span-2"
            >
              {loading ? (
                <EmptyState label="Loading..." />
              ) : data?.performance_trends?.length ? (
                <LineChart data={data.performance_trends} margin={{ top: 8, right: 16, left: 16, bottom: 18 }}>
                  <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="week"
                    tick={{ fill: palette.text, fontSize: 12 }}
                    axisLine={{ stroke: palette.axis }}
                    tickLine={false}
                    tickFormatter={formatIsoWeek}
                    tickMargin={6}
                  />
                  <YAxis
                    width={28}
                    tick={{ fill: palette.text, fontSize: 12 }}
                    axisLine={{ stroke: palette.axis }}
                    tickLine={false}
                    tickMargin={6}
                    padding={{ bottom: 6 }}
                  />


                  <Tooltip
                    content={
                      <CardTooltip
                        formatter={makeTooltipFormatter({
                          percentKeys: ["speech_avg", "emotion_match"],
                        })}
                        titleFormatter={(iso) => `Week of ${formatIsoWeek(iso)}`}
                      />
                    }
                  />


                  <Line
                    type="monotone"
                    dataKey="speech_avg"
                    stroke="#C9CED6"
                    strokeWidth={2}
                    dot={(p) => {
                      const { cx, cy, payload, r = 3 } = p;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={colorForScore(payload.speech_avg)}
                          stroke="#fff"
                          strokeWidth={1}
                        />
                      );
                    }}
                    activeDot={(p) => {
                      const { cx, cy, payload } = p;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5}
                          fill={colorForScore(payload.speech_avg)}
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      );
                    }}
                  />


                  <Line
                    type="monotone"
                    dataKey="emotion_match"
                    stroke="#C9CED6"
                    strokeWidth={2}
                    dot={(p) => {
                      const { cx, cy, payload, r = 3 } = p;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={colorForScore(payload.emotion_match)}
                          stroke="#fff"
                          strokeWidth={1}
                        />
                      );
                    }}
                    activeDot={(p) => {
                      const { cx, cy, payload } = p;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5}
                          fill={colorForScore(payload.emotion_match)}
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      );
                    }}
                  />
                </LineChart>
              ) : (
                <EmptyState />
              )}
            </WideCard>


            {/* Row 3 */}
            <SquareCard title="Average Score by Mood" desc="Average performance scores by the session mood." legend={<ScoreLegend />}>
              {loading ? (
                <EmptyState label="Loading..." />
              ) : data?.mood_performance?.length ? (
                <ScatterChart margin={{ top: 8, right: 12, left: 16, bottom: 18 }}>
                  <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="mood" tick={{ fill: palette.text, fontSize: 12 }} axisLine={{ stroke: palette.axis }} tickLine={false} tickMargin={6} />
                  <YAxis width={28} dataKey="avg_accuracy" tick={{ fill: palette.text, fontSize: 12 }} axisLine={{ stroke: palette.axis }} tickLine={false} tickMargin={6} padding={{ bottom: 6 }} />
                  <Tooltip
                    content={
                      <CardTooltip formatter={makeTooltipFormatter({ percentKeys: ["avg_accuracy"] })} titleFormatter={defaultLabelFormatter} />
                    }
                  />
                  <Scatter data={data.mood_performance}>
                    {data.mood_performance.map((row, i) => (
                      <Cell key={i} fill={colorForScore(row.avg_accuracy)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              ) : (
                <EmptyState />
              )}
            </SquareCard>


            <SquareCard title="Lessons That Need More Practice" desc="Lessons with lower average accuracy indicating review needs." legend={<ScoreLegend />}>
              {loading ? (
                <EmptyState label="Loading..." />
              ) : data?.lesson_difficulty?.length ? (
                <BarChart data={data.lesson_difficulty} margin={{ top: 8, right: 12, left: 16, bottom: 18 }}>
                  <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="lesson" tick={{ fill: palette.text, fontSize: 12 }} axisLine={{ stroke: palette.axis }} tickLine={false} tickMargin={6} />
                  <YAxis width={28} tick={{ fill: palette.text, fontSize: 12 }} axisLine={{ stroke: palette.axis }} tickLine={false} tickMargin={6} padding={{ bottom: 6 }} />
                  <Tooltip
                    content={
                      <CardTooltip formatter={makeTooltipFormatter({ percentKeys: ["avg_accuracy"] })} titleFormatter={defaultLabelFormatter} />
                    }
                  />
                  <Bar dataKey="avg_accuracy" maxBarSize={32} radius={[8, 8, 0, 0]}>
                    {data.lesson_difficulty.map((row, i) => (
                      <Cell key={i} fill={colorForScore(row.avg_accuracy)} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <EmptyState />
              )}
            </SquareCard>
          </div>
        </div>
      </main>
    </div>
  );
}


/* ---------- Sidebar Links ---------- */
function SidebarLinks({ location }) {
  return (
    <>
      <Link
        to="/teacher"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          location.pathname === "/teacher" ? "bg-white text-[#2E4bff]" : "hover:bg-white/10"
        }`}
      >
        <GoHome className="text-xl" />
        <span>Dashboard</span>
      </Link>


      <Link
        to="/teacher/students"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          location.pathname.startsWith("/teacher/students") ? "bg-white text-[#2E4bff]" : "hover:bg-white/10"
        }`}
      >
        <PiStudentBold className="text-xl" />
        <span>Students</span>
      </Link>


      <Link
        to="/teacher/analytics"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          location.pathname.startsWith("/teacher/analytics") ? "bg-white text-[#2E4bff]" : "hover:bg-white/10"
        }`}
      >
        <SiGoogleanalytics className="text-xl" />
        <span>Analytics</span>
      </Link>

      <Link
        to="/teacher/lesson-management"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          location.pathname.startsWith("/teacher/lesson-management")
            ? "bg-white text-[#2E4bff]"
            : "hover:bg-white/10"
        }`}
      >
        <MdMenuBook className="text-xl" />
        <span>Manage</span>
      </Link>

    </>
  );
}


/* ---------- FIXED CARDS (added relative) ---------- */


function SquareCard({ title, desc, legend, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-[#111]">{title}</h2>
        {desc ? <p className="text-xs text-gray-500 mt-1">{desc}</p> : null}
        {legend ? <div className="mt-2">{legend}</div> : null}
      </div>


      {/* RELATIVE FIX APPLIED */}
      <div className="w-full h-72 md:h-80 relative">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}


function WideCard({ title, desc, legend, className = "", children }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-5 ${className}`}>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-[#111]">{title}</h2>
        {desc ? <p className="text-xs text-gray-500 mt-1">{desc}</p> : null}
        {legend ? <div className="mt-2">{legend}</div> : null}
      </div>


      {/* RELATIVE FIX APPLIED */}
      <div className="w-full h-80 md:h-96 relative">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}







