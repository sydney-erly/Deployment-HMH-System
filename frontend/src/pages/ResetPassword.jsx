import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { motion } from "framer-motion";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");

  const token = searchParams.get("token");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    if (password !== confirm) {
      setMessage("Passwords do not match.");
      setStatus("error");
      return;
    }

    try {
      const res = await apiFetch("/auth/reset-password", {
        method: "POST",
        body: { token, new_password: password },
      });

      if (res.message) {
        setStatus("done");
        setMessage(res.message);
        setTimeout(() => navigate("/login"), 2000);
      } else {
        throw new Error(res.error || "Something went wrong.");
      }
    } catch (err) {
      setStatus("error");
      const msg = err.message.replace(/^HTTP\\s\\d+:\\s*/, "");  
      setMessage(msg);
    }
  } // ✅ closes handleSubmit

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#ffffff] text-[#000] px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white shadow-lg rounded-2xl p-8 text-center"
      >
        <h1 className="text-2xl font-bold text-[#1800ad] mb-4">
          Reset Password
        </h1>
        {!token ? (
          <p className="text-red-600">
            Invalid or missing token. Please use the reset link from your email.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="New password"
              className="border border-gray-300 w-full p-3 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-[#1800ad]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Confirm password"
              className="border border-gray-300 w-full p-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-[#1800ad]"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <button
              disabled={status === "loading"}
              type="submit"
              className="w-full py-3 rounded-lg bg-[#1800ad] text-white font-semibold hover:bg-[#15008f] transition"
            >
              {status === "loading" ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}

        {message && (
          <p
            className={`mt-4 text-sm ${
              status === "error" ? "text-red-600" : "text-green-700"
            }`}
          >
            {message}
          </p>
        )}
      </motion.div>
    </div>
  );
}
