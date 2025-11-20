
//send email to reset password


// src/pages/ForgotPassword.jsx
import React, { useState } from "react";
import { apiFetch } from "../lib/api";
import { motion } from "framer-motion";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await apiFetch("/auth/request-reset", {
      method: "POST",
      body: { email }, // ✅ let apiFetch handle JSON.stringify
    });


      if (res.message) {
        setStatus("done");
        setMessage(res.message);
      } else {
        throw new Error(res.error || "Something went wrong.");
      }
    } catch (err) {
      setStatus("error");
      setMessage(err.message);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#ffffff] text-[#000] px-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white shadow-lg rounded-2xl p-8 text-center"
      >
        <h1 className="text-2xl font-bold text-[#1800ad] mb-4">
          Forgot Password
        </h1>
        <p className="text-gray-600 mb-6">
          Enter your email address and we’ll send you a password reset link.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            required
            placeholder="Enter your email"
            className="border border-gray-300 w-full p-3 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-[#1800ad]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            disabled={status === "loading"}
            type="submit"
            className="w-full py-3 rounded-lg bg-[#1800ad] text-white font-semibold hover:bg-[#15008f] transition"
          >
            {status === "loading" ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

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
