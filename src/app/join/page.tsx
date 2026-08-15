import Link from "next/link";
import { AuthForm } from "@/components/controls";
import { Card } from "@/components/ui";
import { isDemoMode } from "@/lib/config";

export default function JoinPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-14">
      <h1 className="mb-1 text-xl font-bold text-zinc-100">Claim your owner seat</h1>
      <p className="mb-5 text-sm text-zinc-500">
        Two seats total. Your account starts in PAPER mode with $25 of simulated cash, your own
        limits, and your own kill switch.
      </p>
      <Card>
        {isDemoMode() ? (
          <p className="text-sm text-amber-300">
            Demo mode: joining is disabled until a database is connected.{" "}
            <Link href="/dashboard" className="underline">
              Explore the demo instead →
            </Link>
          </p>
        ) : (
          <AuthForm kind="join" />
        )}
      </Card>
    </main>
  );
}
