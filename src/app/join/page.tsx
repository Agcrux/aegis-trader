import Link from "next/link";
import { AuthForm } from "@/components/controls";
import { Card } from "@/components/ui";
import { isSetupIncomplete } from "@/lib/config";

export default function JoinPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-14">
      <h1 className="mb-1 text-xl font-bold text-on-surface">Claim your owner seat</h1>
      <p className="mb-5 text-sm text-on-surface-variant">
        Two seats total. Your account starts in PAPER mode with $25 of paper cash, your own
        limits, and your own kill switch — trading on live market data.
      </p>
      <Card>
        {isSetupIncomplete() ? (
          <p className="text-sm text-[#ffde9c]">
            Joining needs a database, which isn&apos;t connected yet.{" "}
            <Link href="/markets" className="underline">
              Open the live market terminal →
            </Link>
          </p>
        ) : (
          <AuthForm kind="join" />
        )}
      </Card>
    </main>
  );
}
