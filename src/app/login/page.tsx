import Link from "next/link";
import { AuthForm, TesterButton } from "@/components/controls";
import { Card } from "@/components/ui";
import { isSetupIncomplete, TESTER_START_CASH } from "@/lib/config";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-14">
      <h1 className="mb-1 text-xl font-bold text-on-surface">Sign in</h1>
      <p className="mb-5 text-sm text-on-surface-variant">
        Two owner seats, or a tester sandbox for anyone who just wants to try it.
      </p>

      <Card>
        {isSetupIncomplete() ? (
          <p className="text-sm text-[#ffde9c]">
            Owner sign-in needs a database, which isn&apos;t connected yet. The tester sandbox below
            works without one.
          </p>
        ) : (
          <AuthForm kind="login" />
        )}
      </Card>

      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.05em] text-on-surface-variant/70">
        <span className="h-px flex-1 bg-outline-variant" />
        or
        <span className="h-px flex-1 bg-outline-variant" />
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-on-surface">Tester — paper trading</h2>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-on-surface-variant">
          ${TESTER_START_CASH.toLocaleString("en-US")} of play money against real live prices. No
          card, no broker, no real dollars — the dashboard tracks your{" "}
          <span className="text-primary">potential earnings</span>: exactly what those trades would
          have made in real USD. Your sandbox is stored in this browser and survives refreshes.
        </p>
        <TesterButton />
      </Card>

      <p className="mt-4 text-xs text-on-surface-variant/80">
        An owner? <Link href="/join" className="text-primary hover:underline">Join with your invite code</Link>
      </p>
    </main>
  );
}
