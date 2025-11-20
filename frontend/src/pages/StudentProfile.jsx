import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import { Pencil } from "lucide-react";
import LoadingScreen from "../components/LoadingScreen";
import CTAButton from "../components/CTAButton";

import previousImg from "../assets/previous.png";

import streakImg from "../assets/streak.png";
import lessonImg from "../assets/lesson.png";
import progressImg from "../assets/progress.png";
import wildfireImg from "../assets/wildfire.png";
import scholarImg from "../assets/scholar.png";
import sharpshooterImg from "../assets/sharpshooter.png";
import weekendImg from "../assets/weekend.png";

export default function StudentProfile() {
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const lang = (localStorage.getItem("hmh_lang") || "en").toLowerCase();

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await apiFetch("/student/profile", { token: auth.token() });
        setData(res);
      } catch (err) {
        console.error("Failed to load profile:", err);
      }
    }
    loadProfile();
  }, []);

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const res = await apiFetch("/student/profile", {
        method: "PUT",
        token: auth.token(),
        body: formData,
        isForm: true,
      });

      setData((prev) => ({
        ...prev,
        student: { ...prev.student, photo_url: res.photo_url },
      }));

      if (res?.photo_url) {
        localStorage.setItem("hmh_photo_url", res.photo_url);
        window.dispatchEvent(new Event("hmh_photo_updated"));
      }
    } catch (err) {
      console.error("Photo upload failed:", err);
    }
  }

  if (!data) {
    return (
      <LoadingScreen
        visible={true}
        bg="#EAE4D0"
        text={lang === "en" ? "LOADING PROFILE..." : "INA-LOAD ANG PROFILE..."}
      />
    );
  }

  const { student, stats, progress_percent } = data;

  const defaultPfp =
    "https://yourproject.supabase.co/storage/v1/object/public/hmh-images/pfp/defaultpfp.png";

  // Derived values
  const totalLessons = 30;
  const level = Math.min(stats.lessonsCompleted, totalLessons);
  const birth = student.birthday ? new Date(student.birthday) : null;
  const age = birth ? new Date().getFullYear() - birth.getFullYear() : "-";

  // --- Scholar description based on speech level ---
  let scholarDesc = "";
  if (student.speech_level === "non_verbal") {
    scholarDesc =
      lang === "en"
        ? "Learn 10 sounds in a single chapter"
        : "Matutunan ang 10 tunog sa isang kabanata";
  } else if (student.speech_level === "emerging") {
    scholarDesc =
      lang === "en"
        ? "Learn 10 words in a single chapter"
        : "Matutunan ang 10 salita sa isang kabanata";
  } else {
    scholarDesc =
      lang === "en"
        ? "Learn 10 short sentences in a single chapter"
        : "Matutunan ang 10 maiikling pangungusap sa isang kabanata";
  }

  // --- Achievements (merge from DB + local progress) ---
  const backendAchievements = (data.achievements || []).map((a) => ({
    id: a.achievements_code,
    name: a.achievements?.name || a.achievements_code,
    desc: a.achievements?.description || "",
    progress: 1,
    goal: 1,
  }));

  const localProgressAchievements = [
    {
      id: "wildfire",
      name: lang === "en" ? "Wildfire" : "Arangkada",
      desc:
        lang === "en"
          ? "Reach a 3-day streak"
          : "Makabuo ng 3 sunod-sunod na araw ng pag-aaral",
      progress: stats.streakDays || 0,
      goal: 3,
    },
    {
      id: "scholar",
      name: lang === "en" ? "Scholar" : "Iskolar",
      desc: scholarDesc,
      progress: stats.activitiesPassed || 0,
      goal: 10,
    },
    {
      id: "sharpshooter",
      name: lang === "en" ? "Sharpshooter" : "Perpekto!",
      desc:
        lang === "en"
          ? "Complete 1 lesson with no mistake"
          : "Tapusin ang aralin nang walang mali",
      progress: stats.perfectLesson ? 1 : 0,
      goal: 1,
    },
    {
      id: "weekend",
      name: lang === "en" ? "Weekend Warrior" : "Linggo ng Kaalaman",
      desc:
        lang === "en"
          ? "Complete a lesson on Saturday and Sunday"
          : "Tapusin ang aralin tuwing Sabado at Linggo",
      progress: stats.weekendLessons || 0,
      goal: 2,
    },
  ];

  const combinedAchievements = [...backendAchievements, ...localProgressAchievements];

  const iconMap = {
    wildfire: wildfireImg,
    scholar: scholarImg,
    sharpshooter: sharpshooterImg,
    weekend: weekendImg,
    first_correct: wildfireImg, // optional placeholders
    three_in_a_row: scholarImg,
  };

  return (
    <div className="min-h-screen bg-[#0D1117] text-white font-poppins flex flex-col items-center py-8 px-4">
      {/* Back button */}
      <motion.img
        whileTap={{ scale: 0.9 }}
        onClick={() => nav(-1)}
        src={previousImg}
        alt="Back"
        className="absolute top-6 left-6 w-10 h-10 cursor-pointer hover:opacity-80 active:scale-90 select-none"
        draggable="false"
      />

      {/* Profile Header */}
      <motion.div
        className="bg-[#161B22] rounded-2xl p-6 w-full max-w-md text-center shadow-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="relative group w-28 h-28 mx-auto mb-4">
          <img
            src={student.photo_url || defaultPfp}
            onError={(e) => (e.currentTarget.src = defaultPfp)}
            alt="Avatar"
            className="w-full h-full rounded-full object-cover border-4 border-[#FFC84A] shadow-md group-hover:scale-105 transition-transform"
          />
          <label
            htmlFor="photo-upload"
            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 
                     flex items-center justify-center rounded-full cursor-pointer 
                     transition-opacity duration-300"
          >
            <div className="bg-[#FFC84A] p-2 rounded-full">
              <Pencil className="w-4 h-4 text-white" />
            </div>
            <input
              id="photo-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </label>
        </div>

        <h2 className="text-xl font-extrabold">{student.first_name}</h2>
        <p className="text-sm opacity-70">
          {lang === "en" ? "Age:" : "Edad:"} {age}
        </p>
        <p className="text-sm opacity-70">
          {lang === "en" ? "Level" : "Antas"} {level}/30
        </p>
      </motion.div>

      {/* Stats Section */}
      <div className="w-full max-w-md mt-8">
        <h3 className="font-bold text-lg mb-3">
          {lang === "en" ? "Statistics" : "Pag-uulat"}
        </h3>

        <div className="grid grid-cols-3 gap-3">
          {/* Day Streak */}
          <div className="bg-[#161B22] rounded-xl p-3 flex flex-col items-center justify-center text-center">
            <img src={streakImg} alt="streak" className="w-10 h-10 mb-2" />
            <p className="text-sm text-gray-400">
              {lang === "en" ? "Day Streak" : "Tuloy-tuloy na Araw"}
            </p>
            <p className="text-lg font-bold">{stats.streakDays || 0}</p>
          </div>

          {/* Lessons Done */}
          <div className="bg-[#161B22] rounded-xl p-3 flex flex-col items-center justify-center text-center">
            <img src={lessonImg} alt="lessons" className="w-10 h-10 mb-2" />
            <p className="text-sm text-gray-400">
              {lang === "en" ? "Lessons Done" : "Natapos na Aralin"}
            </p>
            <p className="text-lg font-bold">{stats.lessonsCompleted || 0}</p>
          </div>

          {/* Progress */}
          <div className="bg-[#161B22] rounded-xl p-3 flex flex-col items-center justify-center text-center">
            <img src={progressImg} alt="progress" className="w-10 h-10 mb-2" />
            <p className="text-sm text-gray-400">
              {lang === "en" ? "Progress" : "Progreso"}
            </p>
            <p className="text-lg font-bold">{progress_percent}%</p>
          </div>
        </div>
      </div>

      {/* Achievements */}
      <div className="w-full max-w-md mt-8">
        <h3 className="font-bold text-lg mb-3">
          {lang === "en" ? "Achievements" : "Mga Tagumpay"}
        </h3>

        <div className="flex flex-col gap-3">
          {combinedAchievements.map((a) => {
            const icon = iconMap[a.id] || wildfireImg;
            return (
              <div
                key={a.id}
                className="bg-[#161B22] rounded-xl p-4 shadow-md flex items-center gap-3"
              >
                <img
                  src={icon}
                  alt={a.name}
                  className="w-10 h-10 flex-shrink-0"
                />
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-semibold">{a.name}</p>
                    <p className="text-sm text-gray-400">
                      {a.progress}/{a.goal}
                    </p>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-2 bg-[#FFC84A] transition-all"
                      style={{
                        width: `${Math.min(
                          (a.progress / a.goal) * 100,
                          100
                        )}%`,
                      }}
                    ></div>
                  </div>
                  <p className="text-xs mt-2 text-gray-400">{a.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider line */}
      <hr className="w-full max-w-md border-t border-gray-700 mt-10 mb-6 opacity-60" />

      {/* Logout */}
      <div className="w-full max-w-md flex justify-center mb-12">
        <CTAButton
          variant="red"
          size="medium"
          onClick={() => {
            auth.signout();
            nav("/login");
            setTimeout(() => window.location.reload(), 150);
          }}
        >
          {lang === "en" ? "Logout" : "Mag-logout"}
        </CTAButton>
      </div>
    </div>
  );
}
