"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMode } from "./mode-context";
import { Activity, BookOpen, Archive, Database, FileCheck, BarChart3 } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Index", icon: Activity },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
  { href: "/archive", label: "Archive", icon: Archive },
  { href: "/sources", label: "Sources", icon: Database },
  { href: "/review", label: "Review", icon: FileCheck },
  { href: "/backtest", label: "Backtest", icon: BarChart3 },
];

export function Navbar() {
  const pathname = usePathname();
  const { mode } = useMode();

  return (
    <header className="sticky top-0 z-50 border-b border-border glass-panel">
      <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="font-serif text-lg tracking-tight text-text-primary">
            Meridian
          </span>
          {mode === "quant" && (
            <span className="text-[10px] font-mono uppercase tracking-widest text-accent border border-accent/30 px-1.5 py-0.5 rounded">
              QR
            </span>
          )}
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors
                  ${
                    isActive
                      ? "text-text-primary bg-bg-surface"
                      : "text-text-muted hover:text-text-secondary hover:bg-bg-hover/50"
                  }
                `}
              >
                <Icon size={14} strokeWidth={2} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Period indicator */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-cooperation pulse-dot" />
          <span className="font-mono">2026-Q1</span>
        </div>
      </div>
    </header>
  );
}
