// tailwind.config.js
import { heroui } from "@heroui/theme";

/** @type {import('tailwindcss').Config} */
export const content = [
  "./src/**/*.{js,ts,jsx,tsx,mdx}",
  "./node_modules/@heroui/theme/dist/components/(autocomplete|alert|button|calendar|checkbox|date-input|date-picker|form|input|modal|pagination|progress|radio|select|skeleton|spinner|table|ripple|listbox|divider|popover|scroll-shadow|spacer).js"
];
export const theme = {
  extend: {},
};
export const darkMode = "class";
export const plugins = [heroui()];