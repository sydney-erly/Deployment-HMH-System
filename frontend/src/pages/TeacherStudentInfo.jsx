// src/pages/TeacherStudentInfo.jsx
// updated with modal-based alerts (no browser alert())

import TeacherStudentOverview from "./TeacherStudentOverview";
import TeacherStudentReportsTab from "./TeacherStudentReportsTab";
import TeacherStudentActivityLog from "./TeacherStudentActivityLog";
import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useParams, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import { FiLogOut } from "react-icons/fi";
import { GoHome } from "react-icons/go";
import { PiStudentBold } from "react-icons/pi";
import { SiGoogleanalytics } from "react-icons/si";
import { MdDeleteOutline } from "react-icons/md";
import hmhIcon from "../assets/hmh_icon.png";

export default function TeacherStudentInfo() {
  const nav = useNavigate();
  const location = useLocation();

  // supports :students_id or :id
  const params = useParams();
  const students_id = params.students_id ?? params.id;

  const token = auth.token();

  const [student, setStudent] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [tab, setTab] = useState("overview");

  // NEW: feedback modal (replaces alert())
  const [modal, setModal] = useState({
    open: false,
    type: "success", // 'success' | 'error' | 'info'
    message: "",
  });

  // sidebar state & gesture
  const [navOpen, setNavOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);

  // fetch student
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setStudent(null);
      setFormData({});
      try {
        const res = await apiFetch(`/teacher/student/${students_id}`, { token });
        if (!alive) return;
        setStudent(res);
        setFormData(res);
      } catch (e) {
        console.error("Failed to fetch student info:", e);
        setModal({
          open: true,
          type: "error",
          message: "Failed to load student information.",
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [students_id, token]);

  // background color
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#F6F7FB";
    return () => (document.body.style.backgroundColor = prev);
  }, []);

  // scroll lock for drawer
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = navOpen ? "hidden" : prev || "";
    return () => (document.body.style.overflow = prev);
  }, [navOpen]);

  // swipe gestures
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

  // form helpers
  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value === "—" ? "" : value }));
  }
  function handleCancel() {
    setFormData(student);
    setEditing(false);
  }
  function handleSavePrompt() {
    setShowConfirm(true);
  }

  function whitelist(src = {}) {
    const allowed = [
      "first_name",
      "middle_name",
      "last_name",
      "birthday",
      "sex",
      "diagnosis",
      "speech_level",
      "enrollment_status",
      "grade_level",
      "school_last_attended",
      "religion",
      "address",
      "father_name",
      "mother_name",
      "guardian_name",
      "guardian_relationship",
      "contact_number",
      "email",
      "room_assignment",
      "schedule",
      "class_time",
      "photo_url",
    ];
    const out = {};
    for (const k of allowed) if (k in src) out[k] = src[k];
    return out;
  }

  function normalizeValues(out) {
    for (const k of Object.keys(out)) {
      const v = out[k];
      if (typeof v === "string") {
        const t = v.trim();
        out[k] = t === "" || t === "—" ? null : t;
      } else if (v === "" || v === undefined) {
        out[k] = null;
      }
    }
    if (out.birthday) {
      const d = new Date(out.birthday);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        out.birthday = `${y}-${m}-${dd}`;
      } else out.birthday = null;
    }
    if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) out.email = null;
    if (out.contact_number && typeof out.contact_number === "string") {
      const digits = out.contact_number.replace(/[^\d+]/g, "");
      out.contact_number = digits || null;
    }
    return out;
  }

  function applyRequiredFallbacks(out, current) {
    const required = ["first_name", "last_name"];
    for (const k of required) {
      if (out[k] == null && current?.[k]) out[k] = current[k];
    }
    if (out.enrollment_status == null && current?.enrollment_status == null)
      out.enrollment_status = "Active";
    if (out.speech_level == null && current?.speech_level == null)
      out.speech_level = "N/A";
    if (out.sex == null && current?.sex == null) out.sex = "Unspecified";
    return out;
  }

  function diffPayload(current = {}, next = {}) {
    const changed = {};
    for (const k of Object.keys(next)) {
      const a = current?.[k];
      const b = next[k];
      const same =
        (a == null && b == null) ||
        (typeof a === "string" && typeof b === "string" && a === b) ||
        a === b;
      if (!same) changed[k] = b;
    }
    return changed;
  }

  async function confirmSave() {
    setShowConfirm(false);
    setSaving(true);
    try {
      let candidate = whitelist(formData);
      candidate = normalizeValues(candidate);
      candidate = applyRequiredFallbacks(candidate, student);
      const payload = diffPayload(whitelist(student), candidate);

      if (!Object.keys(payload).length) {
        setEditing(false);
        setModal({
          open: true,
          type: "info",
          message: "No changes to save.",
        });
        setSaving(false);
        return;
      }

      await apiFetch(`/teacher/student/${students_id}`, {
        method: "PUT",
        token,
        body: payload,
      });

      setStudent((prev) => ({ ...prev, ...payload }));
      setFormData((prev) => ({ ...prev, ...payload }));
      setEditing(false);
      setModal({
        open: true,
        type: "success",
        message: "Student information updated successfully!",
      });
    } catch (err) {
      console.error("Error updating student:", err);
      setModal({
        open: true,
        type: "error",
        message: "Failed to update student information.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    try {
      await apiFetch(`/teacher/student/${students_id}`, {
        method: "DELETE",
        token,
      });
      setModal({
        open: true,
        type: "success",
        message: "Student deleted successfully.",
      });
    } catch (err) {
      console.error("Error deleting student:", err);
      setModal({
        open: true,
        type: "error",
        message: "Failed to delete student.",
      });
    }
  }

  // SVG avatar fallback
  const fallbackAvatarDataUri =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>
        <circle cx='48' cy='48' r='44' fill='none' stroke='%232E4bff' stroke-width='3'/>
        <circle cx='48' cy='38' r='14' fill='%232E4bff'/>
        <path d='M16 78c7-12 19-18 32-18s25 6 32 18' fill='%232E4bff'/>
      </svg>`
    );

  const imgSrc = student?.photo_url_resolved || student?.photo_url || null;

  return (
    <div className="min-h-[100dvh] bg-[#F6F7FB] flex lg:pl-64 overflow-x-hidden">
      {/* Desktop Sidebar */}
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
          <SidebarLinks location={location} />
        </div>
        <div className="pt-2 border-t border-white/20 flex justify-center">
          <button
            className="p-3 rounded-full hover:bg:white/10 hover:bg-white/10"
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
          <img
            src={hmhIcon}
            alt="HearMyHeart Icon"
            className="w-auto h-15 mb-2 object-contain"
          />
          <div className="text-2xl font-bold">HearMyHeart</div>
        </div>
        <SidebarLinks location={location} />
      </div>
      {navOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Main */}
      <main
        key={students_id}
        className="flex-1 px-6 md:px-10 py-8 overflow-y-auto overflow-x-hidden"
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-[#111]">Student Information</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-[70vh] text-gray-500">
            Loading student information...
          </div>
        ) : !student ? (
          <div className="text-center text-gray-500 mt-10">
            No student information found.
          </div>
        ) : (
          <>
            {/* Identity */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-5">
              <div className="flex items-center gap-6">
                {imgSrc ? (
                  <img
                    src={imgSrc}
                    alt="Profile"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 rounded-full object-cover border-2 border-[#2E4bff] bg-white"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = fallbackAvatarDataUri;
                    }}
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full grid place-items-center">
                    <svg viewBox="0 0 24 24" className="w-24 h-24">
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
                <div className="flex-1">
                  <div className="text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight">
                    {student.first_name} {student.last_name}
                  </div>
                  <div className="mt-1 flex flex-wrap lg:gap-x-20 gap-x-10 gap-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">Room</span>
                      <div className="font-bold text-gray-900">
                        {student.room_assignment || "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Schedule</span>
                      <div className="font-bold text-gray-900">
                        {student.schedule || "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Diagnosis</span>
                      <div className="font-bold text-gray-900">
                        {student.diagnosis || "—"}
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-500">Speech Level</span>
                      <div className="font-bold text-gray-900">
                        {student.speech_level || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="hidden sm:flex items-center gap-6 text-lg font-semibold px-2">
              {[
                ["overview", "Overview"],
                ["profile", "Profile Details"],
                ["progress", "Progress Reports"],
                ["activity", "Activity Log"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`pb-2 border-b-4 transition ${
                    tab === key
                      ? "border-[#2E4bff] text-[#2E4bff]"
                      : "border-transparent text-gray-700 hover:text-[#2E4bff]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Mobile dropdown */}
            <div className="sm:hidden px-2 mt-2">
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#2E4bff]/40"
              >
                <option value="overview">Overview</option>
                <option value="profile">Profile Details</option>
                <option value="progress">Progress Reports</option>
                <option value="activity">Activity Log</option>
              </select>
            </div>

            {/* Tab Content */}
            <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 p-5 md:p-6 min-h-[45vh]">
              {tab === "overview" && (
                <TeacherStudentOverview studentId={students_id} token={token} />
              )}

              {tab === "profile" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSavePrompt();
                  }}
                  className="space-y-6"
                >
                  {/* Personal Info header row with delete icon */}
                  <div className="flex items-center justify-between gap-3 mt-2 border-b pb-1">
                    <h3 className="text-lg font-semibold text-[#2E4bff]">
                      Personal Information
                    </h3>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => setShowDelete(true)}
                        className="text-red-500 hover:text-red-700 transition flex items-center gap-1 shrink-0"
                        title="Delete Student"
                      >
                        <MdDeleteOutline className="text-2xl" />
                      </button>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      ["first_name", "First Name"],
                      ["middle_name", "Middle Name"],
                      ["last_name", "Last Name"],
                      ["birthday", "Birthday"],
                      ["sex", "Gender"],
                      ["diagnosis", "Diagnosis"],
                      ["speech_level", "Speech Level"],
                      ["room_assignment", "Room Assignment"],
                      ["schedule", "Schedule"],
                      ["class_time", "Class Time"],
                    ].map(([name, label]) => (
                      <InputField
                        key={name}
                        label={label}
                        name={name}
                        value={formData[name] || ""}
                        onChange={handleChange}
                        disabled={!editing}
                      />
                    ))}
                  </div>

                  <SectionTitle>Background</SectionTitle>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      ["enrollment_status", "Enrollment Status"],
                      ["grade_level", "Grade Level"],
                      ["school_last_attended", "School Last Attended"],
                      ["religion", "Religion"],
                    ].map(([name, label]) => (
                      <InputField
                        key={name}
                        label={label}
                        name={name}
                        value={formData[name] || ""}
                        onChange={handleChange}
                        disabled={!editing}
                      />
                    ))}
                    <div className="md:col-span-2">
                      <InputField
                        label="Address"
                        name="address"
                        value={formData.address || ""}
                        onChange={handleChange}
                        disabled={!editing}
                      />
                    </div>
                  </div>

                  <SectionTitle>Guardian Information</SectionTitle>
                  <div className="grid md:grid-cols-2 gap-4">
                    {[
                      ["father_name", "Father's Name"],
                      ["mother_name", "Mother's Name"],
                      ["guardian_name", "Guardian Name"],
                      ["guardian_relationship", "Guardian Relationship"],
                      ["contact_number", "Parent Contact"],
                      ["email", "Email"],
                    ].map(([name, label]) => (
                      <InputField
                        key={name}
                        label={label}
                        name={name}
                        value={formData[name] || ""}
                        onChange={handleChange}
                        disabled={!editing}
                      />
                    ))}
                  </div>

                  <div className="sticky bottom-0 -mx-5 md:-mx-6 -mb-5 bg-white rounded-b-2xl border-t p-4 flex justify-end gap-3">
                    {editing ? (
                      <>
                        <button
                          type="button"
                          onClick={handleCancel}
                          className="px-6 py-2 bg-gray-300 text-gray-800 rounded-xl hover:bg-gray-400 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSavePrompt}
                          disabled={saving}
                          className="px-8 py-2 bg-[#2E4bff] text-white rounded-xl hover:brightness-110 transition disabled:opacity-50"
                        >
                          {saving ? "Saving..." : "Save Changes"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="px-6 py-2 rounded-xl bg-[#2E4bff] text-white hover:brightness-110 transition"
                      >
                        Update Info
                      </button>
                    )}
                  </div>
                </form>
              )}

              {tab === "progress" && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    {/* Progress header (no button here; PDF handled inside tab) */}
                  </div>
                  <TeacherStudentReportsTab
                    studentId={students_id}
                    token={token}
                    student={student}
                  />
                </div>
              )}

              {tab === "activity" && (
                <TeacherStudentActivityLog studentId={students_id} token={token} />
              )}
            </div>
          </>
        )}

        {/* Delete confirmation modal */}
        {showDelete && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-[90%] max-w-md text-center border border-gray-100">
              <h3 className="text-xl font-semibold text-red-600 mb-3">
                Careful! This action can&apos;t be undone.
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to permanently delete this student and all of
                their records from HearMyHeart?
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setShowDelete(false)}
                  className="px-6 py-2 bg-gray-300 text-gray-800 rounded-xl hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-8 py-2 bg-red-600 text-white rounded-xl hover:brightness-110 transition"
                >
                  Delete Student
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save confirmation modal */}
        {showConfirm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-[90%] max-w-md text-center border border-gray-100">
              <h3 className="text-xl font-semibold text-[#2E4bff] mb-3">
                Confirm Update
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to update this student’s information?
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-6 py-2 bg-gray-300 text-gray-800 rounded-xl hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSave}
                  className="px-8 py-2 bg-[#2E4bff] text-white rounded-xl hover:brightness-110 transition"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Feedback modal (replaces all alert()) */}
        {modal.open && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl text-center border border-gray-100">
              {modal.type === "success" && (
                <h2 className="text-xl font-semibold text-green-600 mb-3">
                  Success
                </h2>
              )}
              {modal.type === "error" && (
                <h2 className="text-xl font-semibold text-red-600 mb-3">Error</h2>
              )}
              {modal.type === "info" && (
                <h2 className="text-xl font-semibold text-[#2E4bff] mb-3">
                  Notice
                </h2>
              )}

              <p className="text-gray-700 mb-6">{modal.message}</p>

              <button
                onClick={() => {
                  const deleted = modal.message
                    .toLowerCase()
                    .includes("deleted successfully");
                  setModal({ open: false, type: "success", message: "" });
                  if (deleted) {
                    nav("/teacher/students");
                  }
                }}
                className="px-6 py-2 rounded-xl bg-[#2E4bff] text-white hover:brightness-110 transition"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- Helper Components ---------- */
function SectionTitle({ children }) {
  return (
    <h3 className="text-lg font-semibold text-[#2E4bff] mt-4 border-b pb-1 w-full">
      {children}
    </h3>
  );
}

function InputField({ label, name, value, onChange, disabled }) {
  const displayValue = value?.trim() === "" && disabled ? "—" : value;
  return (
    <label className="flex flex-col text-sm min-w-0">
      <span className="text-gray-700 font-medium mb-1">{label}</span>
      <input
        type="text"
        name={name}
        value={displayValue || ""}
        onFocus={(e) => {
          if (e.target.value === "—") e.target.value = "";
        }}
        onChange={onChange}
        disabled={disabled}
        readOnly={disabled}
        className={`w-full px-3 py-2 rounded-lg border bg-gray-50 focus:outline-none focus:ring-2 ${
          disabled
            ? "text-black border-gray-300 bg-gray-100 cursor-not-allowed focus:ring-0"
            : "text-black border-gray-300 focus:ring-[#2E4bff]/50"
        }`}
      />
    </label>
  );
}

function SidebarLinks({ location }) {
  return (
    <>
      <Link
        to="/teacher"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          location.pathname === "/teacher"
            ? "bg-white text-[#2E4bff]"
            : "hover:bg-white/10"
        }`}
      >
        <GoHome className="text-xl" />
        <span>Dashboard</span>
      </Link>
      <Link
        to="/teacher/students"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          location.pathname.startsWith("/teacher/students") ||
          location.pathname.startsWith("/teacher/student")
            ? "bg-white text-[#2E4bff]"
            : "hover:bg-white/10"
        }`}
      >
        <PiStudentBold className="text-xl" />
        <span>Students</span>
      </Link>
      <Link
        to="/teacher/analytics"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          location.pathname.startsWith("/teacher/analytics")
            ? "bg-white text-[#2E4bff]"
            : "hover:bg-white/10"
        }`}
      >
        <SiGoogleanalytics className="text-xl" />
        <span>Analytics</span>
      </Link>
    </>
  );
}
