import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Language from "./pages/Language";
import Mood from "./pages/Mood";
import Time from "./pages/Time";
import StudentDashboard from "./pages/StudentDashboard";
import SessionOver from "./pages/SessionOver";
import ActivityPage from "./pages/ActivityPage";
import StudentProfile from "./pages/StudentProfile";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherStudents from "./pages/TeacherStudents";
import ProtectedRoute from "./components/ProtectedRoute";
import TeacherAddStudent from "./pages/TeacherAddStudent";
import TeacherAnalytics from "./pages/TeacherAnalytics";
import TeacherStudentInfo from "./pages/TeacherStudentInfo";
import TeacherStudentProgress from "./pages/TeacherStudentProgress";
import LessonManagement from "./pages/LessonManagement";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import TeacherProfile from "./pages/TeacherProfile";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/language"
          element={
            <ProtectedRoute role="student">
              <Language />
            </ProtectedRoute>
          }
        />
        <Route
          path="/mood"
          element={
            <ProtectedRoute role="student">
              <Mood />
            </ProtectedRoute>
          }
        />
        <Route
          path="/time"
          element={
            <ProtectedRoute role="student">
              <Time />
            </ProtectedRoute>
          }
        />

        <Route
          path="/student-dashboard"
          element={
            <ProtectedRoute role="student">
              <StudentDashboard />
            </ProtectedRoute>
          }
        />

        {/* Redirect any legacy /dashboard → /student-dashboard */}
        <Route path="/dashboard" element={<Navigate to="/student-dashboard" replace />} />

        <Route
          path="/lesson/:lessonId"
          element={
            <ProtectedRoute role="student">
              <ActivityPage />
            </ProtectedRoute>
          }
        />
     
        <Route
          path="/student/profile"
          element={
            <ProtectedRoute role="student">
              <StudentProfile />
            </ProtectedRoute>
          }
        />

        {/* Teacher routes */}
        <Route
          path="/teacher"
          element={
            <ProtectedRoute role="teacher">
              <TeacherDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/students"
          element={
            <ProtectedRoute role="teacher">
              <TeacherStudents />
            </ProtectedRoute>
          }
        />      
       <Route
          path="/teacher/analytics"
          element={
            <ProtectedRoute role="teacher">
              <TeacherAnalytics />
            </ProtectedRoute>
          }
        />

        <Route 
          path="/teacher/lesson-management"
          element={
            <ProtectedRoute role="teacher">
              <LessonManagement />
            </ProtectedRoute>
          }
        />

        {/*Route to adding student page*/}
         <Route
          path="/teacher/addstudent"
          element={
            <ProtectedRoute role="teacher">
              <TeacherAddStudent />
            </ProtectedRoute>
          }
        />

         <Route
          path="/teacher/student/:students_id"
          element={
            <ProtectedRoute role="teacher">
              <TeacherStudentInfo />
            </ProtectedRoute>
          }
        />
         <Route
          path="/teacher/student/:students_id/progress"
          element={
            <ProtectedRoute role="teacher">
              <TeacherStudentProgress />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher/profile"
          element={
            <ProtectedRoute role="teacher">
              <TeacherProfile />
            </ProtectedRoute>
          }
        />
        {/* Shared route */}

        <Route path="/session-over" element={<SessionOver />} />

        {/* 404 fallback */}
        <Route path="*" element={<div className="p-6">Not found</div>} />
      </Routes>
    </BrowserRouter>
  );
}
