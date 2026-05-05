import { useState, useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { initTheme, saveTheme } from "../lib/studyDeck";

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-4 w-4"
    >
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

const link = ({ isActive }) =>
  `text-sm transition ${isActive ? "text-white" : "text-slate-400 hover:text-white"}`;

export default function Layout() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(initTheme());
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
  };

  return (
    <div className="min-h-screen text-slate-200 antialiased">
      <header className="border-b border-white/8">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <NavLink
            to="/"
            className="text-xs font-semibold uppercase tracking-widest text-violet-400/80"
          >
            Lecture2Quiz SEA
          </NavLink>
          <nav className="flex items-center gap-4">
            <NavLink to="/" end className={link}>
              Home
            </NavLink>
            <NavLink to="/library" className={link}>
              Library
            </NavLink>
            <NavLink to="/quiz" className={link}>
              Quiz
            </NavLink>
            <NavLink to="/flashcards" className={link}>
              Flashcards
            </NavLink>
            <button
              onClick={toggleTheme}
              className="rounded-lg p-1.5 text-slate-400 transition hover:text-white"
              title={theme === "dark" ? "Switch to light" : "Switch to dark"}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="py-8 text-center text-xs text-slate-600">
        Lecture2Quiz SEA
      </footer>
    </div>
  );
}
