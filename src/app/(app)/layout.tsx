import Nav from "@/components/Nav";
import { SetupBanner } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { isSetupIncomplete } from "@/lib/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  const isTester = user?.role === "TESTER";
  // The setup banner is about the owner/engine layer, which testers never touch.
  const incomplete = isSetupIncomplete() && !isTester;
  return (
    <div className="flex min-h-screen flex-col">
      <Nav userName={user?.name ?? null} isTester={isTester} />
      <main className="flex-1 px-4 pb-24 pt-5 sm:ml-60 sm:px-6 sm:pb-8">
        <div className="mx-auto w-full max-w-6xl">
          {incomplete ? <SetupBanner /> : null}
          {children}
        </div>
      </main>
    </div>
  );
}
