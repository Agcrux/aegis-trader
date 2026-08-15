import Nav from "@/components/Nav";
import { DemoBanner } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  const demo = isDemoMode();
  return (
    <div className="flex min-h-screen flex-col">
      <Nav userName={user?.name ?? null} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-5 sm:pb-10">
        {demo ? <DemoBanner /> : null}
        {children}
      </main>
    </div>
  );
}
