import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import ActivityRunner from "../views/activities/ActivityRunner";

export default function ActivityPage() {
  const { lessonId } = useParams();
  const nav = useNavigate();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auth.token()) {
      nav("/login", { replace: true });
      return;
    }

    (async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/student/lesson/${lessonId}/activities`, {
          token: auth.token(),
          params: { lang: localStorage.getItem("hmh_lang") || "en" },
        });
        // IMPORTANT: unwrap { ok, activities }
        setActivities(res?.activities || []);
      } catch (err) {
        console.error("Failed to load activities", err);
        setError("Could not load activities. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId, nav]);

  if (loading) return <div className="p-6 text-center">Loading activities...</div>;

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        {error}
        <button className="hmh-btn hmh-btn-retry mt-4" onClick={() => nav("/student-dashboard")}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!activities.length) {
    return (
      <div className="p-6 text-center">
        <p>No activities found for this lesson.</p>
        <button className="hmh-btn hmh-btn-retry mt-4" onClick={() => nav("/dashboard")}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return <ActivityRunner activities={activities} lessonId={lessonId} />;
}
