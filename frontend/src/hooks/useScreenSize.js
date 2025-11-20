// frontend/src/hooks/useScreenSize.js
// updated 11/14/2025
import { useState, useEffect } from "react";


export function useScreenSize() {
  const [width, setWidth] = useState(window.innerWidth);


  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);


  return {
    isMobile: width <= 425,
    isTablet: width > 425 && width <= 768,
    isLaptop: width > 768 && width <= 1024,
    isDesktop: width > 1024,
  };
}

