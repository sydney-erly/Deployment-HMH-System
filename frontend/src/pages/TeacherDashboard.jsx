// src/pages/TeacherDashboard.jsx
//updated 11/20/2025 03:57AM
import hmhIcon from "../assets/hmh_icon.png";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import { Link, useNavigate, useLocation, Navigate } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { GoHome } from "react-icons/go";
import { PiStudentBold } from "react-icons/pi";
import { SiGoogleanalytics } from "react-icons/si";
import { FiUsers, FiLogOut } from "react-icons/fi";
import InitialAvatar from "../components/InitialAvatar";

export default function TeacherDashboard() {
  const nav = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);

  // 🔒 Auth guard
  const isTeacher = auth.isTeacher();
  if (!isTeacher) return <Navigate to="/login" replace />;

  // Mobile drawer state
  const [navOpen, setNavOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  // Make token reactive and wait for it after refresh
  const [token, setToken] = useState(() => auth.token());
  useEffect(() => {
    const unsub = auth.onChange?.(() => setToken(auth.token()));
    if (!unsub && !token) {
      const id = setInterval(() => {
        const t = auth.token();
        if (t) {
          setToken(t);
          clearInterval(id);
        }
      }, 100);
      return () => clearInterval(id);
    }
    return () => unsub?.();
  }, []);

  // Fetch overview
  useEffect(() => {
    if (!token) return; // wait until token exists
    (async () => {
      try {
        const res = await apiFetch("/teacher/overview", { token });

        // 1) Map line series from backend
        let finalLineSeries = (res.lineSeries ?? [])
          .map((item) => ({
            date: (item.date || item.day || "").split("T")[0],
            avg: Number(item.avg ?? item.average_score ?? 0),
          }))
          .filter((p) => p.date && Number.isFinite(p.avg))
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        // 2) Only keep last 7 dates that actually have output
        if (finalLineSeries.length > 7) {
          finalLineSeries = finalLineSeries.slice(-7);
        }

        // 3) Bar series unchanged
        const mappedBarSeries = (res.barSeries ?? []).map((item) => ({
          diagnosis: item.diagnosis ?? "Unknown",
          count: item.count ?? 0,
        }));

        const lastPoint = finalLineSeries[finalLineSeries.length - 1];

        setData({
          ...res,
          lineSeries: finalLineSeries,
          barSeries: mappedBarSeries,
          counts: { ...(res.counts || {}), avg_last: lastPoint?.avg ?? 0 },
        });
      } catch (e) {
        console.error("Overview fetch failed:", e);
        setData({
          greeting: "Error: " + e.message,
          lineSeries: [],
          barSeries: [],
          counts: { avg_last: 0 },
        });
      }
    })();
  }, [token]);

  // Body bg
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#F6F7FB";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  // Scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = navOpen ? "hidden" : prev || "";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  // Swipe gestures (mobile)
  const EDGE_WIDTH = 24,
    OPEN_THRESHOLD = 80,
    CLOSE_THRESHOLD = -80;
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
    setDragX(Math.max(0, t.clientX - startXRef.current));
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
    setDragX(Math.min(0, t.clientX - startXRef.current));
  }
  function onDrawerTouchEnd() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragX < CLOSE_THRESHOLD) setNavOpen(false);
    setDragX(0);
  }

  // Drawer transform (mobile)
  const drawerStyle = {};
  let drawerClasses =
    "fixed inset-y-0 left-0 w-64 bg-[#2E4bff] text-white p-6 flex flex-col z-50 shadow-lg will-change-transform transition-transform duration-200 ease-out";
  if (navOpen) {
    drawerStyle.transform = `translateX(${Math.min(0, dragX)}px)`;
  } else if (!navOpen && dragX > 0) {
    drawerStyle.transform = `translateX(calc(-100% + ${dragX}px))`;
  } else {
    drawerClasses += " -translate-x-full";
  }

  const greeting = data?.greeting || "Hello";
  const teacherPhoto =
    data?.teacher?.photo_url_resolved || data?.teacher?.photo_url || "";
  const lineSeries = data?.lineSeries || [];
  const barSeries = data?.barSeries || [];

  const getBarColor = (d) =>
    d === "ASD"
      ? "#E65460"
      : d === "DS"
      ? "#FFC84A"
      : d === "GDD"
      ? "#2E8B57"
      : d === "SPEECH DELAY"
      ? "#9F2C0C"
      : d === "ADHD"
      ? "#1C4211"
      : "#8884d8";

  return (
    <>
      <style>{`
        .kpi-grid { 
          display: grid; 
          gap: 1.5rem; 
          grid-template-columns: 1fr; 
        }

        /* Tablet and up: always 3 columns */
        @media (min-width: 768px) { 
          .kpi-grid { 
            grid-template-columns: repeat(3, minmax(0,1fr)); 
          }
        }
      `}</style>


      <div className="min-h-[100dvh] bg-[#F6F7FB] flex flex-col lg:flex-row lg:pl-64">
        {/* Sidebar */}
        <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-64 bg-[#2E4bff] text-white px-6 py-8 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex flex-col items-center mb-8">
              <img
                src={hmhIcon}
                alt="HearMyHeart Icon"
                className="w-auto h-18 mb-3 object-contain"
              />
              <div className="text-2xl font-bold">HearMyHeart</div>
            </div>
            <Link
              to="/teacher"
              className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 transition-all font-medium ${
                location.pathname === "/teacher"
                  ? "bg-white text-[#2E4bff] font-semibold"
                  : "hover:bg-white/10"
              }`}
            >
              <GoHome className="text-xl" />
              <span>Dashboard</span>
            </Link>
            <Link
              to="/teacher/students"
              className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 transition-all font-medium ${
                location.pathname.startsWith("/teacher/students")
                  ? "bg-white text-[#2E4bff] font-semibold"
                  : "hover:bg-white/10"
              }`}
            >
              <PiStudentBold className="text-xl" />
              <span>Students</span>
            </Link>
            <Link
              to="/teacher/analytics"
              className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 transition-all font-medium ${
                location.pathname.startsWith("/teacher/analytics")
                  ? "bg-white text-[#2E4bff] font-semibold"
                  : "hover:bg-white/10"
              }`}
            >
              <SiGoogleanalytics className="text-xl" />
              <span>Analytics</span>
            </Link>
          </div>

          <div className="pt-2 border-t border-white/20 flex justify-center">
            <button
              className="p-3 rounded-full hover:bg-white/10 transition-transform"
              onClick={() => {
                auth.signout();
                nav("/login");
              }}
            >
              <FiLogOut className="text-2xl transform rotate-180" />
            </button>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {!navOpen && (
          <div
            className="lg:hidden fixed inset-y-0 left-0 w-15 z-40"
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
            <img
              src={hmhIcon}
              alt="HearMyHeart Icon"
              className="w-auto h-15 mb-2 object-contain"
            />
            <div className="text-2xl font-bold">HearMyHeart</div>
          </div>

          <Link
            to="/teacher"
            onClick={() => setNavOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 transition-all font-medium ${
              location.pathname === "/teacher"
                ? "bg-white text-[#2E4bff] font-semibold"
                : "hover:bg-white/10"
            }`}
          >
            <GoHome className="text-xl" /> <span>Dashboard</span>
          </Link>
          <Link
            to="/teacher/students"
            onClick={() => setNavOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 transition-all font-medium ${
              location.pathname.startsWith("/teacher/students")
                ? "bg-white text-[#2E4bff] font-semibold"
                : "hover:bg-white/10"
            }`}
          >
            <PiStudentBold className="text-xl" /> <span>Students</span>
          </Link>
          <Link
            to="/teacher/analytics"
            onClick={() => setNavOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 transition-all font-medium ${
              location.pathname.startsWith("/teacher/analytics")
                ? "bg-white text-[#2E4bff] font-semibold"
                : "hover:bg-white/10"
            }`}
          >
            <SiGoogleanalytics className="text-xl" /> <span>Analytics</span>
          </Link>

          <div className="mt-auto pt-2 border-t border-white/20 flex justify-center">
            <button
              className="p-3 rounded-full hover:bg-white/10 transition-transform"
              onClick={() => {
                auth.signout();
                nav("/login");
              }}
            >
              <FiLogOut className="text-2xl transform rotate-180" />
            </button>
          </div>
        </div>

        {navOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/40 z-40"
            onClick={() => setNavOpen(false)}
          />
        )}

        {/* ---------- Main Content ---------- */}
        <main className="flex-1 p-4 md:p-8">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          {data?.teacher ? (
            <p className="text-lg text-gray-600 mt-1">
              {greeting.split("Teacher")[0]}
              <Link
                to="/teacher/profile"
                className="font-semibold text-gray-600 hover:text-[#2E4bff] transition"
              >
                Teacher {data.teacher.first_name}
              </Link>
              !
            </p>
          ) : (
            <p className="text-lg text-gray-600 mt-1">{greeting}</p>
          )}

          {/* KPI row */}
          <div className="kpi-grid mt-6">
            <KpiCard
              icon={<FiUsers />}
              title="Students"
              value={data?.counts?.students ?? 0}
            />
            <KpiCard
              icon={<span />}
              title="Sessions Today"
              value={data?.counts?.sessions_today ?? 0}
            />
            <KpiCard
              icon={<span />}
              title="Avg Score (last)"
              value={data?.counts?.avg_last ?? 0}
            />
          </div>

          {/* Student Progress Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <div className="lg:col-span-3 bg-white rounded-2xl p-5 shadow-sm">
              <div className="font-semibold mb-3">Student Progress Overview</div>
              <div className="h-64 flex items-center justify-center">
                {lineSeries.length === 0 ? (
                  <span className="text-gray-400">No progress data available</span>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lineSeries}>
                      <CartesianGrid
                        stroke="#E5E7EB"
                        strokeDasharray="3 3"
                      />
                      <XAxis dataKey="date" tick={{ fill: "#6B7280" }} />
                      <YAxis tick={{ fill: "#6B7280" }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="avg"
                        stroke="#E65460"
                        strokeWidth={3}
                        dot={{ r: 4, stroke: "#E65460", fill: "#fff" }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Diagnosis Population */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6 stack-1024">
            <div className="bg-white rounded-2xl p-2.5 shadow-sm xl:mr-[-70px]">
              <div className="font-semibold mb-3 mt-1.5 ml-1.5">
                School Calendar
              </div>
              <MiniCalendar iso={data?.todayISO} />
            </div>

            <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm xl:ml-15">
              <div className="font-semibold mb-3">Diagnosis Population</div>
              <div className="h-64 flex items-center justify-center ml-[-35px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barSeries}>
                    <CartesianGrid
                      stroke="#E5E7EB"
                      strokeDasharray="4 5"
                    />
                    <XAxis
                      dataKey="diagnosis"
                      tick={{ fill: "#6B7280" }}
                      padding={{ left: 15, right: 30 }}
                    />
                    <YAxis tick={{ fill: "#6B7280" }} />
                    <Tooltip />
                    <Bar dataKey="count" barSize={55}>
                      {barSeries.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={getBarColor(entry.diagnosis)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="hidden lg:block w-75 bg-white p-6 border-l border-gray-100">
          <SidebarContent data={data} />
        </aside>
      </div>
    </>
  );
}

/* ------------------ Helper Components ------------------ */
function SidebarContent({ data }) {
  const teacherPhoto =
    data?.teacher?.photo_url_resolved || data?.teacher?.photo_url || "";
  const teacherName =
    `${data?.teacher?.first_name ?? ""} ${
      data?.teacher?.last_name ?? ""
    }`.trim() || "Teacher";
  const teacher = data?.teacher;
  const initials =
    teacher?.initials ||
    `${(teacher?.first_name || "T")[0]}${
      (teacher?.last_name || "")[0] || ""
    }`;

  return (
    <>
      <div className="hidden lg:flex items-center gap-3 mb-6">
        <Link to="/teacher/profile" className="shrink-0">
          {teacherPhoto ? (
            <img
              src={teacherPhoto}
              alt="Teacher profile"
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full object-cover border-2 border-[#2E4bff] bg-white hover:brightness-110 transition"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = fallbackAvatarDataUri;
              }}
            />
          ) : (
            <InitialAvatar initials={initials} size={48} />
          )}
        </Link>
        <div>
          <Link
            to="/teacher/profile"
            className="font-bold text-lg text-gray-800 hover:text-[#2E4bff] hover:underline transition"
          >
            {teacherName}
          </Link>
          <div className="text-gray-500 text-sm">Teacher</div>
        </div>
      </div>

      <hr className="border-1 border-gray-200 mb-5" />

      <div className="flex items-center justify-between mb-4">
        <div className="font-bold">Recent Students</div>
      </div>

      {/* Recent Active */}
      <div className="space-y-3">
        {(data?.recentActive ?? []).map((r, i) => {
          const imgSrc =
            r?.students?.photo_url_resolved || r?.students?.photo_url || "";
          return (
            <div key={i} className="flex items-center gap-3">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt="Profile"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border-2 border-[#2E4bff] bg-white"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = fallbackAvatarDataUri;
                  }}
                />
              ) : (
                <div className="w-9 h-9 rounded-full grid place-items-center">
                  <svg viewBox="0 0 24 24" className="w-9 h-9">
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="#2E4bff"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <path
                      fill="#2E4bff"
                      d="M12 12c-1.657 0 -3 -1.343 -3 -3s1.343 -3 3 -3s3 1.343 3 3s-1.343 3 -3 3zm0 1.5c2.761 0 5 1.343 6 3.25a8.96 8.96 0 0 1 -12 0c1 -1.907 3.239 -3.25 6 -3.25z"
                    />
                  </svg>
                </div>
              )}
              <div className="text-sm">
                <div className="font-medium">
                  {r.students?.first_name} {r.students?.last_name}
                </div>
                <div className="text-gray-500">{r.students?.login_id}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="font-bold mt-8 mb-3">Inactive Students</div>
      <div className="space-y-3">
        {(data?.inactive ?? []).map((r, i) => {
          const imgSrc = r?.photo_url_resolved || r?.photo_url || "";
          return (
            <div key={i} className="flex items-center gap-3 opacity-80">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt="Profile"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border-2 border-[#2E4bff] bg-white"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = fallbackAvatarDataUri;
                  }}
                />
              ) : (
                <div className="w-9 h-9 rounded-full grid place-items-center">
                  <svg viewBox="0 0 24 24" className="w-9 h-9">
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      stroke="#2E4bff"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <path
                      fill="#2E4bff"
                      d="M12 12c-1.657 0 -3 -1.343 -3 -3s1.343 -3 3 -3s3 1.343 3 3s-1.343 3 -3 3zm0 1.5c2.761 0 5 1.343 6 3.25a8.96 8.96 0 0 1 -12 0c1 -1.907 3.239 -3.25 6 -3.25z"
                    />
                  </svg>
                </div>
              )}
              <div className="text-sm">
                <div className="font-medium">
                  {r.first_name} {r.last_name}
                </div>
                <div className="text-gray-500">{r.login_id}</div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function KpiCard({ icon, title, value }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4">
      <div className="text-2xl">{icon}</div>
      <div>
        <div className="text-gray-500 text-sm">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}

// Same blue SVG fallback used in StudentInfo
const fallbackAvatarDataUri =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>
      <circle cx='48' cy='48' r='44' fill='none' stroke='%232E4bff' stroke-width='3'/>
      <circle cx='48' cy='38' r='14' fill='%232E4bff'/>
      <path d='M16 78c7-12 19-18 32-18s25 6 32 18' fill='%232E4bff'/>
    </svg>`
  );

function MiniCalendar({ iso }) {
  const base = iso ? new Date(iso) : new Date();
  theadjust(base);
  const year = base.getFullYear(),
    month = base.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const isSameMonth = (d) => d.getMonth() === month;
  const isToday = (d) =>
    d.toDateString() === new Date().toDateString();

  return (
    <div className="grid grid-cols-7 gap-1 text-center text-sm">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div key={d} className="text-gray-500">
          {d}
        </div>
      ))}
      {days.map((d, i) => (
        <div
          key={i}
          className={`py-2 rounded-lg ${
            isToday(d)
              ? "bg-[#2E4bff] text-white"
              : isSameMonth(d)
              ? "bg-indigo-50"
              : "bg-gray-50 text-gray-400"
          }`}
        >
          {d.getDate()}
        </div>
      ))}
    </div>
  );
}

/** normalize safari iOS weird timezone bugs for iso-less init */
function theadjust(d) {
  /* no-op */
}
