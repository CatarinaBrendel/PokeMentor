import type { Config } from "tailwindcss";

export default {
  theme: {
    extend: {
      colors: {
        dust: {
          50:  "var(--dust-50)",
          100: "var(--dust-100)",
          200: "var(--dust-200)",
          300: "var(--dust-300)",
          400: "var(--dust-400)",
          500: "var(--dust-500)",
          600: "var(--dust-600)",
          700: "var(--dust-700)",
          800: "var(--dust-800)",
          900: "var(--dust-900)",
        },
        sage: {
          50:  "var(--sage-50)",
          100: "var(--sage-100)",
          200: "var(--sage-200)",
          300: "var(--sage-300)",
          400: "var(--sage-400)",
          500: "var(--sage-500)",
          600: "var(--sage-600)",
          700: "var(--sage-700)",
          800: "var(--sage-800)",
          900: "var(--sage-900)",
        },
        fern: {
          500: "var(--fern-500)",
          700: "var(--fern-700)",
        },
        hunter: {
          500: "var(--hunter-500)",
          700: "var(--hunter-700)",
        },
        pine: {
          500: "var(--pine-500)",
          700: "var(--pine-700)",
        },
      },
    },
  },
} satisfies Config;