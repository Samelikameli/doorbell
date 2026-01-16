"use client";

import React, { useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";

const ThemeClientWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { darkMode } = useTheme();

  useEffect(() => {
    const htmlElement = document.documentElement;
    if (darkMode) {
      htmlElement.classList.add("dark");
    } else {
      htmlElement.classList.remove("dark");
    }
  }, [darkMode]);

  return <>{children}</>;
};

export default ThemeClientWrapper;
