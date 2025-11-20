// src/pages/TeacherProfile.jsx
//updated 11/14/25
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation, Navigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import hmhIcon from "../assets/hmh_icon.png";
import { GoHome } from "react-icons/go";
import { PiStudentBold } from "react-icons/pi";
import { SiGoogleanalytics } from "react-icons/si";
import { FiLogOut, FiEdit3, FiSave, FiX } from "react-icons/fi";

import InitialAvatar from "../components/InitialAvatar";

export default function TeacherProfile() {
  const nav = useNavigate();
  const location = useLocation();
  const [teacher, setTeacher] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [prompt, setPrompt] = useState(null);
  const token = auth.token();


  const isTeacher = auth.isTeacher?.();
  if (!isTeacher) return <Navigate to="/login" replace />;
  window.dispatchEvent(new Event("teacher-photo-updated"));


  // Sidebar state
  const [navOpen, setNavOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);


  // Fetch teacher data
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/teacher/profile", { token });
        setTeacher(res.teacher || res);
        setForm(res.teacher || res);
      } catch (e) {
        console.error("Failed to fetch teacher profile:", e);
      }
    })();
  }, [token]);


  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }


  async function handleSave() {
    setPrompt({
      type: "confirm",
      message: "Are you sure you want to save your changes?",
      onConfirm: async () => {
        try {
          const res = await apiFetch("/teacher/profile", {
            method: "PUT",
            token,
            body: form,
          });
          setTeacher(res);
          setEditing(false);
          setPrompt({ type: "success", message: "Profile updated successfully!" });
        } catch (e) {
          console.error(e);
          setPrompt({ type: "success", message: "Failed to save changes." });
        }
      },
    });
  }


  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;


    setPrompt({
      type: "confirm",
      message: "Upload this photo as your new profile picture?",
      onConfirm: async () => {
        try {
          const formData = new FormData();
          formData.append("file", file);
          const res = await apiFetch("/teacher/photo", {
            method: "POST",
            token,
            body: formData,
          });
          setTeacher((t) => ({ ...t, ...res }));
          setPrompt({ type: "success", message: "Profile photo updated!" });
        } catch (err) {
          console.error("Photo upload failed:", err);
          setPrompt({ type: "success", message: "Upload failed." });
        }
      },
    });
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
          <button className="p-3 rounded-full hover:bg-white/10" onClick={() => { auth.signout(); nav("/login"); }}>
            <FiLogOut className="text-2xl transform rotate-180" />
          </button>
        </div>
      </aside>


      {/* ---------- Main Content ---------- */}
      <main className="flex-1 p-8 md:p-12 flex flex-col items-center justify-center text-center">
        {!teacher ? (
          <div className="text-gray-500">Loading profile...</div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 w-full max-w-lg">
            {/* Editable Image */}
            <label htmlFor="uploadPhoto" className="cursor-pointer relative group block w-fit mx-auto">
            {teacher.photo_url_resolved ? (
              <img
                src={teacher.photo_url_resolved}
                alt="Profile"
                className="w-32 h-32 rounded-full object-cover border-2 border-[#2E4bff] mx-auto mb-4 group-hover:opacity-75 transition"
              />
            ) : (
              <InitialAvatar initials={teacher.initials} size={128} />
            )}

            <input
              id="uploadPhoto"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />

            <div className="absolute bottom-3 right-3 bg-[#2E4bff] text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition">
              <FiEdit3 className="text-sm" />
            </div>
          </label>



            {/* Info Fields */}
            <div className="text-left space-y-4 mt-6">
              {["first_name", "middle_name", "last_name", "email", "birthday"].map((field) => (
                <div key={field}>
                  <label className="block text-gray-500 text-sm mb-1 capitalize">
                    {field.replace("_", " ")}
                  </label>
              {(() => {
                const value = form[field] || "";
                const displayValue = value?.trim() === "" && !editing ? "—" : value;
                return (
                  <input
                    type={field === "birthday" ? "date" : "text"}
                    value={displayValue}
                    disabled={!editing}
                    onChange={(e) => updateField(field, e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border focus:outline-none ${
                      editing
                        ? "border-[#2E4bff] bg-white focus:ring-2 focus:ring-[#2E4bff]/50"
                        : "border-gray-200 bg-gray-50 cursor-not-allowed"
                    }`}
                  />
                );
              })()}
                </div>
              ))}
            </div>


            {/* Buttons */}
            <div className="mt-8 flex justify-center gap-3">
              {!editing ? (
                <button
                  onClick={() => setPrompt({ type: "confirm", message: "Edit your profile details?", onConfirm: () => setEditing(true) })}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl bg-[#2E4bff] text-white hover:brightness-110 transition"
                >
                  <FiEdit3 /> Edit
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-6 py-2 rounded-xl bg-[#2E4bff] text-white hover:brightness-110 transition"
                  >
                    <FiSave /> Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                  >
                    <FiX /> Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </main>


      {/* Prompts */}
      {prompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-lg p-6 w-80 text-center">
            <p className="text-gray-800 mb-6">{prompt.message}</p>
            {prompt.type === "confirm" ? (
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => {
                    prompt.onConfirm?.();
                    setPrompt(null);
                  }}
                  className="px-4 py-2 bg-[#2E4bff] text-white rounded-lg hover:brightness-110 transition"
                >
                  Yes
                </button>
                <button
                  onClick={() => setPrompt(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPrompt(null)}
                className="px-5 py-2 bg-[#2E4bff] text-white rounded-lg hover:brightness-110 transition"
              >
                OK
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function SidebarLinks({ location }) {
  return (
    <>
      <Link
        to="/teacher"
        className={`flex items-center gap-3 px-3 py-2 rounded-xl mb-2 font-medium ${
          location.pathname.startsWith("/teacher") &&
          !location.pathname.includes("/students") &&
          !location.pathname.includes("/analytics")
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
          location.pathname.startsWith("/teacher/students")
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

