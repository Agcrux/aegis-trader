"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Home", icon: "◈" },
  { href: "/journal", label: "Journal", icon: "☰" },
  { href: "/performance", label: "Charts", icon: "▲" },
  { href: "/lab", label: "Lab", icon: "⚗" },
  { href: "/system", label: "System", icon: "⚙" },
] as const;

export default function Nav({ userName }: { userName: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="text-base font-bold tracking-tight text-zinc-100">
            <span className="text-emerald-400">Aegis</span> Trader
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  pathname.startsWith(t.href)
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {userName ? (
              <>
                <span className="hidden text-xs text-zinc-500 sm:inline">{userName}</span>
                <button
                  onClick={logout}
                  className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Bottom tab bar (phones) */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-3xl justify-around">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] ${
                pathname.startsWith(t.href) ? "text-emerald-400" : "text-zinc-500"
              }`}
            >
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
