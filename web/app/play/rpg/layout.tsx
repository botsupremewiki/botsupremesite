import { WithGlobalChat } from "../with-global-chat";

export const dynamic = "force-dynamic";

export default async function RpgLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WithGlobalChat zoneId="eternum" zoneLabel="Eternum">
      {children}
    </WithGlobalChat>
  );
}
