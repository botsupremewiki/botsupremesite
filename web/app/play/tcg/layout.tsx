import { WithGlobalChat } from "../with-global-chat";

export const dynamic = "force-dynamic";

export default async function TcgLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WithGlobalChat>{children}</WithGlobalChat>;
}
