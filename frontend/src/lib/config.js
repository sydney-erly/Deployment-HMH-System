// src/lib/config.js

// Toggle this flag to turn on/off timers, redirects, etc.
export const DEV_MODE = true; 


export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

//for deployment testing
//export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
