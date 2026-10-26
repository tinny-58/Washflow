"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  Waves,
  LogOut,
  Phone,
  Info,
  Tag,
  HelpCircle,
  Menu,
  X,
  LayoutDashboard,
  ArrowRight,
} from "lucide-react";

interface UserProfile {
  id: string;
  name: string;
  username?: string;
  businessName?: string;
  phone?: string;
  email?: string;
  role: "customer" | "client" | "admin";
}

export function Navbar() {
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // References for focus trap & accessible focus return
  const hamburgerButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  // The public navbar must NEVER render on /admin or /client routes
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/client")) {
    return null;
  }

  const refreshUser = useCallback(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if ((data.authenticated || data.success) && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    refreshUser();
    window.addEventListener("auth-changed", refreshUser);
    window.addEventListener("focus", refreshUser);
    return () => {
      window.removeEventListener("auth-changed", refreshUser);
      window.removeEventListener("focus", refreshUser);
    };
  }, [refreshUser]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Focus trap and Escape key listener for accessible modal dialog
  useEffect(() => {
    if (!mobileMenuOpen) return;

    // Trap focus inside the menu
    const menuElement = mobileMenuRef.current;
    if (!menuElement) return;

    const focusableSelectors = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]';
    const focusableElements = Array.from(
      menuElement.querySelectorAll<HTMLElement>(focusableSelectors)
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (firstElement) {
      firstElement.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileMenuOpen(false);
        hamburgerButtonRef.current?.focus();
        return;
      }

      if (e.key === "Tab") {
        if (e.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setUser(null);
    window.dispatchEvent(new Event("auth-changed"));
    window.location.href = "/";
  };

  const navLinks = [
    { href: "/prices", label: "Prices", icon: Tag },
    { href: "/about", label: "About", icon: Info },
    { href: "/faq", label: "FAQ", icon: HelpCircle },
    { href: "/contact", label: "Contact", icon: Phone },
  ];

  const isLinkActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full backdrop-blur-xl bg-slate-950/85 border-b border-white/10 transition-colors h-[var(--nav-h)] box-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link
            href="/"
            className="flex items-center gap-3 group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-xl"
            aria-label="WashFlow Home"
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-sky-500 via-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/25 group-hover:scale-105 transition-transform duration-200">
              <Waves className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-black text-xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-sky-300 bg-clip-text text-transparent">
                  WashFlow
                </span>
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <p className="text-[11px] text-slate-400 -mt-0.5 font-medium tracking-wide">
                Fast, Fresh & Crisp Laundry
              </p>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav
            className="hidden md:flex items-center gap-1.5 lg:gap-2 text-sm font-semibold"
            aria-label="Main Navigation"
          >
            {navLinks.map(({ href, label, icon: Icon }) => {
              const active = isLinkActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`px-3.5 py-2 rounded-xl flex items-center gap-2 transition-all ${
                    active
                      ? "bg-sky-500/15 text-sky-300 border border-sky-400/30 shadow-sm"
                      : "text-slate-300 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-sky-400" : "text-slate-400"}`} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Desktop Right Side: Profile / Dashboard or Sign In */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  href={user.role === "admin" ? "/admin" : user.role === "client" ? "/client" : "/book"}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500/20 to-indigo-500/20 border border-sky-400/30 text-sky-300 text-xs font-bold hover:bg-sky-500/30 transition flex items-center gap-2 shadow-sm"
                >
                  <LayoutDashboard className="w-4 h-4 text-sky-400" />
                  <span>Dashboard</span>
                </Link>

                <div className="flex flex-col text-right">
                  <span className="text-xs font-bold text-white truncate max-w-[140px]">
                    {user.username ? `@${user.username}` : user.businessName || user.name}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-medium">
                    {user.role === "admin" ? "Admin" : "Signed In"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Sign Out"
                  aria-label="Sign Out"
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 transition border border-white/10"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link
                  href="/book"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-sky-500/20 flex items-center gap-1.5"
                >
                  <span>Book Pickup</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href="/#auth-section"
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white border border-white/10 text-xs font-semibold transition"
                >
                  Sign In
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Hamburger Button */}
          <div className="flex md:hidden items-center gap-2">
            {user && (
              <Link
                href={user.role === "admin" ? "/admin" : user.role === "client" ? "/client" : "/book"}
                className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-300 text-xs font-bold flex items-center gap-1.5"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Portal</span>
              </Link>
            )}

            <button
              ref={hamburgerButtonRef}
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-controls="mobile-navigation-dialog"
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-sky-400" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Accessible Mobile Navigation Drawer / Dialog */}
      {mobileMenuOpen && (
        <div
          id="mobile-navigation-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          className="fixed inset-0 z-50 md:hidden bg-slate-950/80 backdrop-blur-md animate-fade-in flex flex-col justify-start"
        >
          <div
            ref={mobileMenuRef}
            className="w-full bg-slate-900 border-b border-white/15 p-5 shadow-2xl flex flex-col space-y-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white">
                  <Waves className="w-4 h-4" />
                </div>
                <span className="font-black text-lg text-white">WashFlow</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  hamburgerButtonRef.current?.focus();
                }}
                aria-label="Close navigation"
                className="p-2 rounded-xl bg-white/5 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Nav Links */}
            <nav className="flex flex-col space-y-1.5" aria-label="Mobile Links">
              {navLinks.map(({ href, label, icon: Icon }) => {
                const active = isLinkActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`p-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition ${
                      active
                        ? "bg-sky-500/20 text-sky-300 border border-sky-400/40"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? "text-sky-400" : "text-slate-400"}`} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Mobile Auth / Dashboard Actions */}
            <div className="pt-3 border-t border-white/10 flex flex-col space-y-2">
              {user ? (
                <>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">
                        {user.username ? `@${user.username}` : user.businessName || user.name}
                      </p>
                      <p className="text-[10px] text-emerald-400">Signed In</p>
                    </div>
                    <Link
                      href={user.role === "admin" ? "/admin" : user.role === "client" ? "/client" : "/book"}
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-3 py-1.5 rounded-lg bg-sky-500 text-white font-bold text-xs"
                    >
                      Dashboard
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs font-bold flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/book"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg"
                  >
                    <span>Book Laundry Pickup</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/#auth-section"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full py-2.5 rounded-xl bg-white/5 text-slate-200 hover:text-white text-xs font-semibold text-center border border-white/10"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
