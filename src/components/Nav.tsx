"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MSym } from "@/components/ui";

/**
 * ProTrader Terminal side rail (from landing.html), adapted to the app's real
 * routes. Fixed left on desktop; collapses to a bottom tab bar on phones.
 */

const TABS = [
  { href: "/dashboard", label: "Overview", icon: "dashboard" },
  { href: "/markets", label: "Markets", icon: "show_chart" },
  { href: "/journal", label: "Journal", icon: "receipt_long" },
  { href: "/performance", label: "Analytics", icon: "analytics" },
  { href: "/lab", label: "Lab", icon: "science" },
  { href: "/system", label: "System", icon: "settings" },
] as const;

/** Testers only get their sandbox and the market terminal. */
const TESTER_TABS: ReadonlyArray<string> = ["/dashboard", "/markets"];

export default function Nav({
  userName,
  isTester = false,
}: {
  userName: string | null;
  isTester?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tabs = isTester ? TABS.filter((t) => TESTER_TABS.includes(t.href)) : TABS;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Desktop side rail */}
      <nav className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-outline-variant bg-surface-container-low py-4 sm:flex">
        <div className="mb-8 px-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container text-primary">
              <MSym name="shield" fill />
            </span>
            <div>
              <h1 className="text-base font-semibold text-on-surface">Aegis Trader</h1>
              {isTester ? (
                <p className="mt-0.5 inline-block rounded-xs bg-tertiary/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-tertiary">
                  TESTER · PLAY MONEY
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.15em] text-on-surface-variant">
                  Guardrails Grade
                </p>
              )}
            </div>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto">
          <ul className="space-y-1">
            {tabs.map((t) => {
              const active = pathname.startsWith(t.href);
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    className={`flex items-center gap-3 px-4 py-2 transition-colors duration-150 active:scale-95 ${
                      active
                        ? "border-r-2 border-primary bg-surface-container-high font-bold text-primary"
                        : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                    }`}
                  >
                    <MSym name={t.icon} fill={active} />
                    <span>{t.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="mt-auto space-y-3 px-4">
          <Link
            href="/markets"
            className="block w-full rounded-sm bg-primary py-2 text-center font-bold text-on-primary transition-colors hover:bg-primary-container active:scale-95"
          >
            Live Markets
          </Link>
          {userName ? (
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <MSym name="logout" className="text-sm" />
              <span>Sign out ({userName})</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <MSym name="login" className="text-sm" />
              <span>Sign in</span>
            </Link>
          )}
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant bg-surface-container-low sm:hidden">
        <div className="mx-auto flex max-w-3xl justify-around">
          {tabs.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] ${
                  active ? "text-primary" : "text-on-surface-variant"
                }`}
              >
                <MSym name={t.icon} fill={active} className="text-lg" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
