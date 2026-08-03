"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/ui/primitives/button.tsx";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Initial sync
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (
      localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") && prefersDark)
    ) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      setIsDark(false);
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggle = () => {
    if (isDark) {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  return (
    <Button
      tone="secondary"
      onClick={toggle}
      className="rounded-xl px-2 sm:px-2.5 h-9 sm:h-10 bg-surface/50 border-border shadow-sm ring-1 ring-ink/5 hover:bg-surface transition-all"
      aria-label="Toggle theme"
      title={isDark ? "Chuyển sang giao diện Sáng" : "Chuyển sang giao diện Tối"}
    >
      {isDark ? (
        <Sun className="h-[18px] w-[18px] shrink-0 text-ink" />
      ) : (
        <Moon className="h-[18px] w-[18px] shrink-0 text-ink" />
      )}
    </Button>
  );
}
