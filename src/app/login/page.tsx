import Link from "next/link";
import { AuthForm } from "@/components/controls";
import { Card } from "@/components/ui";
import { isDemoMode } from "@/lib/config";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-14">
      <h1 className="mb-1 text-xl font-bold text-zinc-100">Sign in</h1>
      <p className="mb-5 text-sm text-zinc-500">Owners only — two seats, no more.</p>
      <Card>
        {isDemoMode() ? (
          <p className="text-sm text-amber-300">
            Demo mode: sign-in is disabled until a database is connected.{" "}
            <Link href="/dashboard" className="underline">
              Explore the demo instead →
            </Link>
          </p>
        ) : (
          <AuthForm kind="login" />
        )}
      </Card>
      <p className="mt-4 text-xs text-zinc-600">
        First time? <Link href="/join" className="text-emerald-400 hover:underline">Join with your invite code</Link>
      </p>
    </main>
  );
}
