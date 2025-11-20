// frontend/src/lib/auth.js
export const auth = {
  saveLogin({ token, role }) {
    localStorage.setItem("hmh_token", token);
    localStorage.setItem("hmh_role", role);
  },
  token() { return localStorage.getItem("hmh_token"); },

  getToken() { return localStorage.getItem("hmh_token"); },
  role() { return localStorage.getItem("hmh_role"); },

  isTeacher() {
    return this.role?.() === "teacher";
  },
  
  signout() {
    localStorage.removeItem("hmh_token");
    localStorage.removeItem("hmh_role");
    localStorage.removeItem("hmh_language");
    localStorage.removeItem("hmh_mood");
    localStorage.removeItem("hmh_session");
  }
};
