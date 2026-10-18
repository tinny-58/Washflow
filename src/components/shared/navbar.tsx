"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Waves, User, ShieldCheck, LogOut } from "lucide-react";

interface UserProfile {
  id: string;
  name: string;
  phone?: string;
  role: string;
}

export function Navbar() {
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-slate-950/60 border-b border-white/10">
      <div className="container max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 group-hover:scale-105 transition-transform">
            <Waves className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-sky-300 bg-clip-text text-transparent">
                WashFlow
              </span>
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <p className="text-[10px] text-slate-400 -mt-1 font-medium tracking-wide">
              Fresh & Crisp Laundry
            </p>
          </div>
        </Link>

        {/* Right side navigation */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-xs font-semibold text-slate-200">{user.name}</span>
                <span className="text-[11px] text-slate-400">{user.phone}</span>
              </div>
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-medium hover:bg-sky-500/30 transition flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin
                </Link>
              )}
              <button
                onClick={handleLogout}
                title="Log out"
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5" />
              Admin Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
