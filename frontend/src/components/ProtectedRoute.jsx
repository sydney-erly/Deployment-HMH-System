import { Navigate } from "react-router-dom";
import { auth } from "../lib/auth";

export default function ProtectedRoute({ children }) {
  const token = auth.token();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}
