// TeacherAddStudent.jsx
// fully updated 2025-12-22

import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import { FiLogOut } from "react-icons/fi";
import { GoHome } from "react-icons/go";
import { PiStudentBold } from "react-icons/pi";
import { SiGoogleanalytics } from "react-icons/si";
import { MdMenuBook } from "react-icons/md"; // ✅ ADD
import hmhIcon from "../assets/hmh_icon.png";

export default function TeacherAddStudent() {
  const nav = useNavigate();
  const location = useLocation();

  const [navOpen, setNavOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);

  // BG
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#F6F7FB";
    return () => (document.body.style.backgroundColor = prev);
  }, []);

  // Scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = navOpen ? "hidden" : prev || "";
    return () => (document.body.style.overflow = prev);
  }, [navOpen]);

  // Swipe threshold
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
  if (navOpen) drawerStyle.transform = `translateX(${Math.min(0, dragX)}px)`;
  else if (!navOpen && dragX > 0)
    drawerStyle.transform = `translateX(calc(-100% + ${dragX}px))`;
  else drawerClasses += " -translate-x-full";

  return (
    <div className="min-h-[100dvh] bg-[#F6F7FB] flex lg:pl-64">
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
          <SidebarLinks location={location} />
        </div>
        <div className="pt-2 border-t border-white/20 flex justify-center">
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
      </aside>

      {/* Mobile drawer */}
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

      <main className="flex-1 px-6 md:px-12 lg:px-16 py-8 overflow-y-auto">
        <h1 className="text-3xl font-bold mb-6">Add New Student</h1>
        <AddStudentForm />
      </main>
    </div>
  );
}

/* Sidebar Links */
function SidebarLinks({ location }) {
  const path = location.pathname.replace(/\/$/, "");

  return (
    <>
      <Link
        to="/teacher"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          path === "/teacher"
            ? "bg-white text-[#2E4bff] font-semibold"
            : "hover:bg-white/10"
        }`}
      >
        <GoHome className="text-xl" />
        <span>Dashboard</span>
      </Link>

      <Link
        to="/teacher/students"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          path.startsWith("/teacher/students") || path === "/teacher/addstudent"
            ? "bg-white text-[#2E4bff] font-semibold"
            : "hover:bg-white/10"
        }`}
      >
        <PiStudentBold className="text-xl" />
        <span>Students</span>
      </Link>

      <Link
        to="/teacher/analytics"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          path.startsWith("/teacher/analytics")
            ? "bg-white text-[#2E4bff] font-semibold"
            : "hover:bg-white/10"
        }`}
      >
        <SiGoogleanalytics className="text-xl" />
        <span>Analytics</span>
      </Link>

      {/* ✅ ADD: Manage */}
      <Link
        to="/teacher/lesson-management"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          path.startsWith("/teacher/lesson-management")
            ? "bg-white text-[#2E4bff] font-semibold"
            : "hover:bg-white/10"
        }`}
      >
        <MdMenuBook className="text-xl" />
        <span>Manage</span>
      </Link>
    </>
  );
}

/* ------------------- ADD STUDENT FORM -------------------- */
function AddStudentForm() {
  const [form, setForm] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    birthday: "",
    sex: "",
    diagnosis: "",
    speech_level: "",
    enrollment_status: "",
    room_assignment: "",
    schedule: "",
    class_time: "",
    grade_level: "",
    school_last_attended: "",
    address: "",
    religion: "",
    father_name: "",
    mother_name: "",
    contact_number: "",
    email: "",
    guardian_name: "",
    guardian_relationship: "",
  });

  const token = auth.token();
  const nav = useNavigate();
  const fieldRefs = useRef({});
  const [errorField, setErrorField] = useState(null);

  // Modals
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [newLoginId, setNewLoginId] = useState("");
  const [saveError, setSaveError] = useState("");

  const REQUIRED = [
    "first_name",
    "middle_name",
    "last_name",
    "birthday",
    "sex",
    "diagnosis",
    "speech_level",
    "room_assignment",
    "schedule",
    "class_time",
  ];

  function setVal(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleSubmit() {
    for (let key of REQUIRED) {
      if (!form[key] || form[key].trim() === "") {
        const el = fieldRefs.current[key];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setErrorField(key);
          setTimeout(() => setErrorField(null), 2000);
        }
        return;
      }
    }
    setConfirmOpen(true);
  }

  async function confirmSave() {
    setConfirmOpen(false);
    try {
      const res = await apiFetch("/teacher/students", {
        method: "POST",
        token,
        body: form,
      });

      setNewLoginId(res.login_id);
      setSaveError("");
      setSuccessOpen(true);
    } catch (e) {
      setNewLoginId("");
      setSaveError(e.message || "Unknown error occurred");
      setSuccessOpen(true);
    }
  }

  return (
    <div className="flex flex-col gap-10 w-full">
      {/* Personal Info */}
      <Section title="Personal Information">
        <Input
          id="first_name"
          label="First Name"
          required
          v={form.first_name}
          onC={(v) => setVal("first_name", v)}
          refMap={fieldRefs}
          errorField={errorField}
        />
        <Input
          id="middle_name"
          label="Middle Name"
          required
          v={form.middle_name}
          onC={(v) => setVal("middle_name", v)}
          refMap={fieldRefs}
          errorField={errorField}
        />
        <Input
          id="last_name"
          label="Last Name"
          required
          v={form.last_name}
          onC={(v) => setVal("last_name", v)}
          refMap={fieldRefs}
          errorField={errorField}
        />

        <Input
          id="birthday"
          label="Birthday"
          type="date"
          required
          v={form.birthday}
          onC={(v) => setVal("birthday", v)}
          refMap={fieldRefs}
          errorField={errorField}
        />

        <Select
          id="sex"
          label="Gender"
          required
          v={form.sex}
          onC={(v) => setVal("sex", v)}
          items={["FEMALE", "MALE"]}
          refMap={fieldRefs}
          errorField={errorField}
        />

        <Input
          id="diagnosis"
          label="Diagnosis"
          required
          v={form.diagnosis}
          onC={(v) => setVal("diagnosis", v)}
          refMap={fieldRefs}
          errorField={errorField}
        />

        <Select
          id="speech_level"
          label="Speech Level"
          required
          v={form.speech_level}
          onC={(v) => setVal("speech_level", v)}
          items={["non_verbal", "emerging", "verbal"]}
          refMap={fieldRefs}
          errorField={errorField}
        />

        <Select
          id="room_assignment"
          label="Room Assignment"
          required
          v={form.room_assignment}
          onC={(v) => setVal("room_assignment", v)}
          items={["Room A", "Room B", "Room C", "Room D"]}
          refMap={fieldRefs}
          errorField={errorField}
        />

        <Select
          id="schedule"
          label="Schedule"
          required
          v={form.schedule}
          onC={(v) => setVal("schedule", v)}
          items={["M-W", "T-TH", "F"]}
          refMap={fieldRefs}
          errorField={errorField}
        />

        {/* FIXED TIME FIELD */}
        <Input
          id="class_time"
          label="Time"
          required
          type="time"
          v={form.class_time}
          onC={(v) => setVal("class_time", v)}
          refMap={fieldRefs}
          errorField={errorField}
        />
      </Section>

      {/* Background */}
      <Section title="Student Background">
        <Select
          id="enrollment_status"
          label="Enrollment Status"
          v={form.enrollment_status}
          onC={(v) => setVal("enrollment_status", v)}
          items={["OLD", "NEW"]}
          refMap={fieldRefs}
        />
        <Input
          id="grade_level"
          label="Grade Level"
          v={form.grade_level}
          onC={(v) => setVal("grade_level", v)}
          refMap={fieldRefs}
        />
        <Input
          id="school_last_attended"
          label="School Last Attended"
          v={form.school_last_attended}
          onC={(v) => setVal("school_last_attended", v)}
          refMap={fieldRefs}
        />
        <Input
          id="address"
          label="Address"
          v={form.address}
          onC={(v) => setVal("address", v)}
          refMap={fieldRefs}
        />
        <Input
          id="religion"
          label="Religion"
          v={form.religion}
          onC={(v) => setVal("religion", v)}
          refMap={fieldRefs}
        />
        <Input
          id="father_name"
          label="Father's Name"
          v={form.father_name}
          onC={(v) => setVal("father_name", v)}
          refMap={fieldRefs}
        />
        <Input
          id="mother_name"
          label="Mother's Name"
          v={form.mother_name}
          onC={(v) => setVal("mother_name", v)}
          refMap={fieldRefs}
        />
        <Input
          id="contact_number"
          label="Contact Number"
          v={form.contact_number}
          onC={(v) => setVal("contact_number", v)}
          refMap={fieldRefs}
        />
        <Input
          id="email"
          label="Email"
          v={form.email}
          onC={(v) => setVal("email", v)}
          refMap={fieldRefs}
        />
        <Input
          id="guardian_name"
          label="Guardian Name"
          v={form.guardian_name}
          onC={(v) => setVal("guardian_name", v)}
          refMap={fieldRefs}
        />
        <Input
          id="guardian_relationship"
          label="Guardian Relationship"
          v={form.guardian_relationship}
          onC={(v) => setVal("guardian_relationship", v)}
          refMap={fieldRefs}
        />
      </Section>

      {/* Buttons */}
      <div className="flex justify-end gap-3 pb-10">
        <button
          onClick={() => nav("/teacher/students")}
          className="px-5 py-2 rounded-xl border border-gray-300 hover:bg-gray-100 transition"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="px-6 py-2 rounded-xl bg-[#2E4bff] text-white font-medium hover:brightness-110 transition"
        >
          Save
        </button>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
            <h2 className="text-xl font-semibold text-[#2E4bff] mb-3">
              Confirm Add Student
            </h2>
            <p className="text-gray-600 mb-6">
              Are you sure you want to add this student?
            </p>

            <div className="flex justify-center gap-4">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmSave}
                className="px-5 py-2 rounded-xl bg-[#2E4bff] text-white hover:brightness-110 transition"
              >
                Yes, Add Student
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success/Error modal */}
      {successOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl text-center">
            {saveError ? (
              <>
                <h2 className="text-xl font-semibold text-red-600 mb-3">
                  Error
                </h2>
                <p className="text-gray-700 mb-4">
                  Failed to add student.
                  <br />
                  <span className="font-semibold text-red-500">
                    {saveError}
                  </span>
                </p>
                <button
                  onClick={() => setSuccessOpen(false)}
                  className="px-6 py-2 rounded-xl bg-red-500 text-white hover:brightness-110 transition"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-green-600 mb-3">
                  Student Added!
                </h2>
                <p className="text-gray-700 mb-4">
                  The student has been successfully added.
                  <br />
                  <span className="font-semibold text-[#2E4bff]">
                    Login ID: {newLoginId}
                  </span>
                </p>
                <button
                  onClick={() => {
                    setSuccessOpen(false);
                    nav("/teacher/students");
                  }}
                  className="px-6 py-2 rounded-xl bg-[#2E4bff] text-white hover:brightness-110 transition"
                >
                  Continue
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------- UI COMPONENTS ------------------- */
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      <div className="bg-[#2E4bff] text-white px-10 py-3 text-lg font-semibold">
        {title}
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
        {children}
      </div>
    </div>
  );
}

function Input({
  id,
  label,
  v,
  onC,
  type = "text",
  refMap,
  errorField,
  required = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (refMap && id) refMap.current[id] = ref.current;
  }, [id, refMap]);

  const showError = errorField === id;

  return (
    <label className="text-sm flex flex-col">
      <span className="text-gray-700 font-medium mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </span>

      <input
        ref={ref}
        type={type}
        value={v || ""}
        onChange={(e) => onC(e.target.value)}
        className={`w-full px-3 py-2 rounded-lg border ${
          showError ? "border-red-500" : "border-gray-300"
        } focus:ring-2 focus:ring-[#2E4bff] outline-none`}
      />
    </label>
  );
}

function Select({
  id,
  label,
  v,
  onC,
  items,
  refMap,
  errorField,
  required = false,
}) {
  const ref = useRef(null);
  useEffect(() => {
    if (refMap && id) refMap.current[id] = ref.current;
  }, [id, refMap]);

  const showError = errorField === id;

  return (
    <label className="text-sm flex flex-col">
      <span className="text-gray-700 font-medium mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </span>

      <select
        ref={ref}
        value={v}
        onChange={(e) => onC(e.target.value)}
        className={`w-full px-3 py-2 rounded-lg border ${
          showError ? "border-red-500" : "border-gray-300"
        } focus:ring-2 focus:ring-[#2E4bff] outline-none`}
      >
        <option value="">Select an option</option>
        {items.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </label>
  );
}
