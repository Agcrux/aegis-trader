import Link from "next/link";
import { Card, MSym, Section } from "@/components/ui";

/**
 * What a tester sees on an owner surface. Owner pages read real accounts, the
 * audited journal and system health; the sandbox keeps its own record instead.
 */
export default function OwnerOnlyNotice({ surface }: { surface: string }) {
  return (
    <Section title={surface}>
      <Card className="flex items-start gap-3">
        <MSym name="shield_lock" className="mt-px text-primary" />
        <div>
          <p className="text-sm text-on-surface">
            {surface} belongs to the owner accounts, so it stays closed in tester mode.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">
            Your sandbox keeps its own trade log, equity curve and potential earnings on the{" "}
            <Link href="/dashboard" className="text-primary hover:underline">
              overview
            </Link>
            , and every symbol&apos;s live chart is in{" "}
            <Link href="/markets" className="text-primary hover:underline">
              Live Markets
            </Link>
            .
          </p>
        </div>
      </Card>
    </Section>
  );
}
