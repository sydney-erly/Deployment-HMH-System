// src/pages/TeacherStudents.jsx
// updated 11/14/2025 + avatar column added

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import { FiPlus, FiLogOut, FiSearch } from "react-icons/fi";
import hmhIcon from "../assets/hmh_icon.png";
import card1 from "../assets/card1.png";
import card2 from "../assets/card2.png";
import card3 from "../assets/card3.png";
import card4 from "../assets/card4.png";
import { GoHome } from "react-icons/go";
import { PiStudentBold } from "react-icons/pi";
import { SiGoogleanalytics } from "react-icons/si";
import { MdMenuBook } from "react-icons/md";


// Fallback avatar SVG
const fallbackAvatar =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>
      <circle cx='48' cy='48' r='44' fill='none' stroke='%232E4bff' stroke-width='3'/>
      <circle cx='48' cy='38' r='14' fill='%232E4bff'/>
      <path d='M16 78c7-12 19-18 32-18s25 6 32 18' fill='%232E4bff'/>
    </svg>`
  );

export default function TeacherStudents() {
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null);
  const [roomSelected, setRoomSelected] = useState(false);
  const [students, setStudents] = useState([]);

  // Search + Sort state
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("last"); // 'last' | 'first'
  const [showNew, setShowNew] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);

  const token = auth.token();
  const nav = useNavigate();
  const location = useLocation();

  // Fetch rooms
  useEffect(() => {
    apiFetch("/teacher/rooms", { token }).then(setRooms);
  }, [token]);

  // Fetch students (by room)
  useEffect(() => {
    if (!roomSelected || !room) return;
    apiFetch("/teacher/students", {
      token,
      params: room ? { room } : undefined,
    }).then(setStudents);
  }, [room, roomSelected, token]);

  // Derived: filtered + sorted students
  const viewStudents = useMemo(() => {
    const norm = (s) => (s || "").toString().toLowerCase();
    const query = norm(q);

    let list = [...students];

    if (query) {
      list = list.filter((s) => {
        const first = norm(s.first_name);
        const last = norm(s.last_name);
        const login = norm(s.login_id);
        return first.includes(query) || last.includes(query) || login.includes(query);
      });
    }

    const cmp = (a, b, keyPrimary, keySecondary) => {
      const A = (a[keyPrimary] || "").toString();
      const B = (b[keyPrimary] || "").toString();
      const r = A.localeCompare(B, undefined, { sensitivity: "base" });
      if (r !== 0) return r;
      const AA = (a[keySecondary] || "").toString();
      const BB = (b[keySecondary] || "").toString();
      return AA.localeCompare(BB, undefined, { sensitivity: "base" });
    };

    if (sortBy === "first") {
      list.sort((a, b) => cmp(a, b, "first_name", "last_name"));
    } else {
      list.sort((a, b) => cmp(a, b, "last_name", "first_name"));
    }

    return list;
  }, [students, q, sortBy]);

  // Background
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#F6F7FB";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, []);

  // Scroll lock when drawer open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = navOpen ? "hidden" : prev || "";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  // Swipe gesture setup
  const EDGE_WIDTH = 60;
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

  // Drawer transform logic
  const drawerStyle = {};
  let drawerClasses =
    "fixed inset-y-0 left-0 w-64 bg-[#2E4bff] text-white p-6 flex flex-col z-[70] shadow-lg will-change-transform transition-transform duration-200 ease-out";
  if (navOpen) {
    const px = Math.min(0, dragX);
    drawerStyle.transform = `translateX(${px}px)`;
  } else if (!navOpen && dragX > 0) {
    drawerStyle.transform = `translateX(calc(-100% + ${dragX}px))`;
  } else {
    drawerClasses += " -translate-x-full";
  }

  return (
    <div className="min-h-[100dvh] bg-[#F6F7FB] flex lg:pl-64 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 h-screen w-64 bg-[#2E4bff] text-white px-6 py-8 flex flex-col justify-between shadow-lg">
        <div>
          <div className="flex flex-col items-center mb-8">
            <img src={hmhIcon} alt="HearMyHeart Icon" className="w-auto h-18 mb-3 object-contain" />
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

          <Link
            to="/teacher/lesson-management"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 transition-all font-medium ${
              location.pathname.startsWith("/teacher/lesson-management")
                ? "bg-white text-[#2E4bff] font-semibold"
                : "hover:bg-white/10"
            }`}
          >
            <MdMenuBook className="text-xl" />
            <span>Manage</span>
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
          className="lg:hidden fixed inset-y-0 left-0 w-12 z-[60] bg-transparent"
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

        <Link
          to="/teacher"
          className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
            location.pathname === "/teacher" ? "bg-white text-[#2E4bff]" : "hover:bg-white/10"
          }`}
        >
          <GoHome className="text-xl" /> <span>Dashboard</span>
        </Link>
        <Link
          to="/teacher/students"
          className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
            location.pathname.startsWith("/teacher/students") ? "bg-white text-[#2E4bff]" : "hover:bg-white/10"
          }`}
        >
          <PiStudentBold className="text-xl" /> <span>Students</span>
        </Link>
        <Link
          to="/teacher/analytics"
          className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
            location.pathname.startsWith("/teacher/analytics") ? "bg-white text-[#2E4bff]" : "hover:bg-white/10"
          }`}
        >
          <SiGoogleanalytics className="text-xl" /> <span>Analytics</span>
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
          <span>Lessons</span>
        </Link>


        <div className="mt-auto pt-2 border-t border-white/20 flex justify-center">
          <button
            className="p-3 rounded-full hover:bg-white/10"
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
          className="lg:hidden fixed inset-0 bg-black/40 z-[65]"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 p-8 pt-8 overflow-x-hidden">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-bold">Manage Students</h1>
        </div>

        {!roomSelected ? (
          <div className="flex flex-col items-start justify-center min-h-[80vh] pb-4 pt-4">
            <div className="hidden bg-green-700 bg-blue-700 bg-amber-700 bg-rose-700" />
            <div className="w-full flex justify-center items-center h-full mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10 w-full">
                {["Room A", "Room B", "Room C", "Room D"].map((k, i) => {
                  const c =
                    rooms.find((r) => r.room.toUpperCase() === k.toUpperCase())?.count ?? 0;
                  const headerColors = ["bg-green-700", "bg-blue-700", "bg-amber-700", "bg-rose-700"];
                  const headerColor = headerColors[i % headerColors.length];
                  const headerImages = [card1, card2, card3, card4];
                  const headerImage = headerImages[i];

                  return (
                    <button
                      key={k}
                      onClick={() => {
                        setRoom(k.toUpperCase());
                        setRoomSelected(true);
                      }}
                      className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100 hover:shadow-2xl transition-all duration-200 text-left w-full h-80 sm:h-96 flex flex-col"
                    >
                      <div
                        className={`${headerColor} flex-[3] w-full bg-cover bg-center rounded-t-2xl`}
                        style={{
                          backgroundImage: `url(${headerImage})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      ></div>

                      <div className="flex-[1] p-6 flex flex-col justify-center">
                        <h3 className="text-[#1C4211] text-xl sm:text-2xl font-bold mb-1">
                          {k}
                        </h3>
                        <p className="text-gray-500 text-sm sm:text-base">
                          {c} students
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Room pills */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 mt-6">
              {["Room A", "Room B", "Room C", "Room D"].map((k) => {
                const c =
                  rooms.find((r) => r.room.toUpperCase() === k.toUpperCase())?.count ?? 0;
                const active = room === k.toUpperCase();
                return (
                  <button
                    key={k}
                    onClick={() => setRoom(k.toUpperCase())}
                    className={`bg-white rounded-2xl p-5 shadow-sm text-left border transition-all duration-150 flex flex-col justify-center h-28 ${
                      active
                        ? "border-2 border-[#2E4bff]"
                        : "border border-transparent hover:border-[#2E4bff]"
                    }`}
                  >
                    <div className="text-gray-500 text-sm">Room</div>
                    <div className="text-2xl font-bold leading-tight">
                      {k.replace("Room ", "")}
                    </div>
                    <div className="text-sm mt-1 text-gray-600">{c} students</div>
                  </button>
                );
              })}
            </div>

            {/* Sort + Search */}
            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              {/* Sort */}
              <div className="flex items-center gap-2 md:justify-start">
                <label className="text-sm text-gray-600">Sort by</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="pr-9 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E4bff]/30"
                >
                  <option value="last">Last name</option>
                  <option value="first">First name</option>
                </select>
              </div>

              {/* Search */}
              <div className="relative w-full md:max-w-md md:ml-auto">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search"
                  className="w-full pl-10 pr-3 py-2 rounded-xl border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E4bff]/30"
                />
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl p-5 shadow-sm mt-4 overflow-x-auto sm:overflow-x-visible">
              <table className="w-full text-sm table-fixed min-w-[600px]">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 w-[35%]">Name</th>
                    <th className="w-[25%] pr-4">Login ID</th>
                    <th className="w-[25%] pl-5">Diagnosis</th>
                    <th className="w-[15%]">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {viewStudents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-500">
                        No students found{q ? " for your search." : "."}
                      </td>
                    </tr>
                  ) : (
                    viewStudents.map((s) => (
                      <tr key={s.students_id} className="border-t hover:bg-gray-50">
                        <td className="py-3 flex items-center">
                          <img
                            src={s.photo_url_resolved || fallbackAvatar}
                            onError={(e) => (e.currentTarget.src = fallbackAvatar)}
                            className="w-8 h-8 rounded-full object-cover mr-3 border border-gray-200"
                            alt="avatar"
                          />

                          <Link
                            to={`/teacher/student/${s.students_id}`}
                            className="hover:underline truncate"
                          >
                            {s.first_name} {s.last_name}
                          </Link>
                        </td>

                        <td className="pr-4">{s.login_id}</td>
                        <td className="pl-5">{s.diagnosis || "—"}</td>
                        <td className="pr-4">{s.enrollment_status || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Floating Add Button */}
        <button
          onClick={() => nav("/teacher/addstudent")}
          className="fixed bottom-6 right-6 sm:bottom-8 sm:right-8 bg-[#2E4bff] text-white w-14 h-14 rounded-full shadow-lg hover:brightness-110 flex items-center justify-center z-[80]"
        >
          <FiPlus className="text-2xl" />
        </button>
      </main>

      {showNew && (
        <NewStudentModal
          onClose={() => setShowNew(false)}
          onCreated={(row) => {
            setShowNew(false);
            alert(`Login ID: ${row.login_id}`);
          }}
        />
      )}
    </div>
  );
}

/* ---------- Modal Component ---------- */
function NewStudentModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    middle_name: "",
    birthday: "",
    religion: "",
    diagnosis: "",
    enrollment_status: "",
    room_assignment: "Room A",
    schedule: "",
    speech_level: "",
    record_status: "Active",
    email: "",
  });
  const token = auth.token();

  function set(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    const res = await apiFetch("/teacher/students", {
      method: "POST",
      token,
      body: form,
    });
    onCreated(res);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-[90]">
      <div className="bg-white rounded-2xl w-full max-w-3xl p-6">
        <div className="text-xl font-bold mb-4">Add New Student</div>
        <hr className="border-t-2 border-gray-500 my-6 w-full mx-auto" />
        <div className="text-md font-bold mb-4">Personal Information</div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <Input label="First Name" v={form.first_name} onC={(v) => set("first_name", v)} />
          <Input label="Last Name" v={form.last_name} onC={(v) => set("last_name", v)} />
          <Input label="Middle Name" v={form.middle_name} onC={(v) => set("middle_name", v)} />
          <Input label="Birthday" type="date" v={form.birthday} onC={(v) => set("birthday", v)} />
          <Input label="Diagnosis" v={form.diagnosis} onC={(v) => set("diagnosis", v)} />
          <Input
            label="Enrollment Status"
            v={form.enrollment_status}
            onC={(v) => set("enrollment_status", v)}
          />
          <Select
            label="Room Assignment"
            v={form.room_assignment}
            onC={(v) => set("room_assignment", v)}
            items={["Room A", "Room B", "Room C", "Room D"]}
          />
          <Input label="Schedule" v={form.schedule} onC={(v) => set("schedule", v)} />
        </div>

        <div className="text-md font-bold mb-4">Student Background</div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Grade Level" v={form.grade_level} onC={(v) => set("grade_level", v)} />
          <Input
            label="School Last Attended"
            v={form.school_last_attended}
            onC={(v) => set("school_last_attended", v)}
          />
          <Input label="Religion" v={form.religion} onC={(v) => set("religion", v)} />
          <Input
            label="Present Address"
            v={form.address}
            onC={(v) => set("address", v)}
          />
          <Input
            label="Father's Name"
            v={form.parent_father}
            onC={(v) => set("parent_father", v)}
          />
          <Input
            label="Mother's Name"
            v={form.parent_mother}
            onC={(v) => set("parent_mother", v)}
          />
          <Input
            label="Contact Number"
            v={form.parent_contact}
            onC={(v) => set("parent_contact", v)}
          />
          <Input label="Email" v={form.email} onC={(v) => set("email", v)} />
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border">
            Cancel
          </button>
          <button onClick={save} className="px-4 py-2 rounded-xl bg-[#2E4bff] text-white">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Reusable Inputs ---------- */
function Input({ label, v, onC, type = "text" }) {
  return (
    <label className="text-sm">
      <div className="text-gray-600 mb-1">{label}</div>
      <input
        type={type}
        value={v || ""}
        onChange={(e) => onC(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border"
      />
    </label>
  );
}

function Select({ label, v, onC, items }) {
  return (
    <label className="text-sm">
      <div className="text-gray-600 mb-1">{label}</div>
      <select
        value={v}
        onChange={(e) => onC(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border"
      >
        {items.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </label>
  );
}
