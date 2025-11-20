import { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { auth } from "../lib/auth";
import { FiEye, FiEyeOff, FiArrowLeft } from "react-icons/fi";
import { useScreenSize } from "../hooks/useScreenSize";

export default function Login() {
  const nav = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [locked, setLocked] = useState(false); // 🚨 NEW
  const { isMobile, isTablet, isDesktop } = useScreenSize();
  const formRef = useRef(null);

  // ✅ Restore remembered login ID
  useEffect(() => {
    const saved = localStorage.getItem("hmh_login_id");
    if (saved) {
      setLoginId(saved);
      setRemember(true);
    }
  }, []);

  // ✅ Submit (with full redirect/session logic + lock handling)
  async function onSubmit(e) {
    e.preventDefault();
    if (submitting || locked) return; // 🚨 stop if locked

    setErr("");
    setSubmitting(true);

    try {
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: { login_id: loginId.trim(), password: pw },
      });

      // 🔒 If backend says account is locked
      if (res.locked) {
        setLocked(true);
        setErr(res.message || "Too many failed attempts. Please try again later.");
        return;
      }

      // --- Teacher success short-circuit ---
      if (res.role === "teacher") {
        auth.signout();
        auth.saveLogin({ token: res.token, role: res.role });
        if (remember) localStorage.setItem("hmh_login_id", loginId.trim());
        else localStorage.removeItem("hmh_login_id");
        nav("/teacher");
        return;
      }

      // --- Student flow with redirect/session restoration ---
      if (res.role === "student") {
        auth.signout();
        auth.saveLogin({ token: res.token, role: res.role });
        if (remember) localStorage.setItem("hmh_login_id", loginId.trim());
        else localStorage.removeItem("hmh_login_id");

        const redirect = res.redirect || "language";
        const s = res.session || null;

        if (redirect === "student-dashboard") {
          // Session still usable — rebuild local mirror
          let endAt = null;
          let status = s?.status || "active";
          let minutes = s?.minutes_allowed || null;

          if (s?.status === "active" && s?.started_at && minutes) {
            const startMs = Date.parse(s.started_at);
            endAt = startMs + minutes * 60 * 1000;
          } else {
            // fallback to any local (rare)
            const raw = localStorage.getItem("hmh_session");
            if (raw) {
              try {
                const local = JSON.parse(raw);
                if (
                  local?.endAt &&
                  Date.now() < local.endAt &&
                  local.status !== "ended"
                ) {
                  endAt = local.endAt;
                  status = local.status;
                  minutes = local.minutes || minutes;
                }
              } catch {}
            }
          }

          localStorage.setItem(
            "hmh_session",
            JSON.stringify({
              session_id:
                s?.id ||
                JSON.parse(localStorage.getItem("hmh_session") || "{}")
                  .session_id ||
                null,
              minutes,
              status,
              endAt,
              started_at: s?.started_at || null,
            })
          );

          nav("/student-dashboard");
          return;
        }

        if (redirect === "session-over") {
          localStorage.removeItem("hmh_session");
          nav("/session-over");
          return;
        }

        // Default: no session yet → language select
        nav("/language");
        return;
      }

      // Invalid creds message passthrough
      if (res.message) {
        setErr(res.message);
        return;
      }

      setErr("Invalid login ID or password.");
    } catch (e) {
      setErr(e.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ✅ Mobile keyboard fix
  useEffect(() => {
    if (isMobile) {
      const el = formRef.current;
      if (!el) return;
      const onFocus = () => {
        setTimeout(
          () => el.scrollIntoView({ behavior: "smooth", block: "center" }),
          200
        );
      };
      const onResize = () => window.scrollTo({ top: 0 });
      const inputs = el.querySelectorAll("input");
      inputs.forEach((inp) => inp.addEventListener("focus", onFocus));
      window.addEventListener("resize", onResize);
      return () => {
        inputs.forEach((inp) => inp.removeEventListener("focus", onFocus));
        window.removeEventListener("resize", onResize);
      };
    }
  }, [isMobile]);

  // ✅ Sizing logic
  const helloSize = isDesktop
    ? "text-6xl"
    : isTablet
    ? "text-3xl whitespace-nowrap"
    : isMobile
    ? "text-2xl whitespace-nowrap"
    : "text-4xl whitespace-nowrap";

  const loginSize = isDesktop
    ? "text-6xl"
    : isTablet
    ? "text-4xl"
    : isMobile
    ? "text-2xl"
    : "text-5xl";

  // ✅ Render layout
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E6F0FF] relative overflow-hidden">
      {/* Back Button */}
      <button
        type="button"
        onClick={() => nav(-1)}
        className="fixed top-4 left-4 z-[999] text-2xl text-white md:text-[#2E4BFF]"
        aria-label="Go back"
      >
        <FiArrowLeft />
      </button>

      <div
        className={`flex w-full h-screen max-md:flex-col ${
          isMobile ? "bg-[#2E4BFF]" : "bg-white"
        }`}
      >
        {/* Left Panel */}
        {!isMobile && (
          <div className="md:w-[300px] lg:w-[350px] xl:w-[600px] bg-[#2E4BFF] flex flex-col justify-center items-center text-white p-10 rounded-r-[190px]">
            <h1 className={`${helloSize} font-extrabold leading-snug mt-10`}>
              Hello, Welcome!
            </h1>
            <p
              className={`${
                isTablet ? "text-md" : "text-xl"
              } whitespace-nowrap opacity-90 mb-15`}
            >
              Great to have you back.
            </p>
          </div>
        )}

        {/* Right Panel */}
        <div
          className={`flex-1 flex flex-col justify-start max-md:w/full max-md:flex-col ${
            isMobile ? "overflow-y-auto min-h-[100dvh]" : ""
          }`}
        >
          {/* Mobile Greeting */}
          {isMobile && (
            <div className="w-full bg-[#2E4BFF] text-white text-center py-12 mt-4">
              <h1 className={`${helloSize} font-extrabold leading-snug`}>
                Hello, Welcome!
              </h1>
              <p className="text-base opacity-90 mt-2">
                Great to have you back.
              </p>
            </div>
          )}

          {/* Login Form */}
          <div className="flex-1 w-full bg-white p-1 flex items-center justify-center max-md:rounded-t-[70px]">
            <form
              ref={formRef}
              onSubmit={onSubmit}
              className="w-2/3 max-md:w/full max-md:mt-[-20px] flex flex-col m-10"
            >
              <h2
                className={`${loginSize} font-bold text-black mb-15 text-center pt-11`}
              >
                Login
              </h2>

              {/* Login ID */}
              <input
                type="text"
                placeholder="Login ID"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                disabled={locked} // 🚨 disable when locked
                className="w-full px-4 py-4 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2E4BFF] mb-10"
                autoComplete="username"
              />

              {/* Password */}
              <div className="relative w-full mb-2">
                <input
                  type={show ? "text" : "password"}
                  placeholder="Password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  disabled={locked} // 🚨 disable when locked
                  className="w-full px-4 py-4 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2E4BFF] pr-12"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  disabled={locked} // 🚨 disable toggle when locked
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#2E4BFF] opacity-70 hover:opacity-100"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <FiEyeOff size={20} /> : <FiEye size={20} />}
                </button>
              </div>

              {/* Remember + Forgot */}
              <div className="flex justify-between items-start mb-6 mt-5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={locked} // 🚨 disable when locked
                    className="w-4 h-4 accent-[#2E4BFF]"
                  />
                  Remember me
                </label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-[#2E4BFF] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>

              {/* Error */}
              {err && (
                <div className="w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
                  {err}
                </div>
              )}

              {/* Lock Notice */}
              {locked && (
                <div className="w-full rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm text-orange-700 mb-4">
                  Too many failed attempts. Please try again later.
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || locked} // 🚨 prevent clicks when locked
                className={`w-full px-5 py-3 rounded-lg bg-[#FFC84A] text-black font-semibold shadow-[0_4px_0_#D9A73A] hover:brightness-105 active:translate-y-[2px] active:shadow-[0_2px_0_#D9A73A] transition mt-[150px] ${
                  submitting || locked ? "opacity-70 cursor-not-allowed" : ""
                }`}
              >
                {submitting ? "Signing in..." : "Login"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
