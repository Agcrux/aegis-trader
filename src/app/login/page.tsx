import Link from "next/link";
import { AuthForm } from "@/components/controls";
import { Card } from "@/components/ui";
import { isSetupIncomplete } from "@/lib/config";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-14">
      <h1 className="mb-1 text-xl font-bold text-on-surface">Sign in</h1>
      <p className="mb-5 text-sm text-on-surface-variant">Owners only — two seats, no more.</p>
      <Card>
        {isSetupIncomplete() ? (
          <p className="text-sm text-[#ffde9c]">
            Sign-in needs a database, which isn&apos;t connected yet.{" "}
            <Link href="/markets" className="underline">
              Open the live market terminal →
            </Link>
          </p>
        ) : (
          <AuthForm kind="login" />
        )}
      </Card>
      <p className="mt-4 text-xs text-on-surface-variant/80">
        First time? <Link href="/join" className="text-primary hover:underline">Join with your invite code</Link>
      </p>
    </main>
  );
}
