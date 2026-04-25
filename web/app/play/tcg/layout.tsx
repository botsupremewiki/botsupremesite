import { getProfile } from "@/lib/auth";
import { GlobalChatSidebar } from "../global-chat-sidebar";

export const dynamic = "force-dynamic";

export default async function TcgLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getProfile();
  return (
    <div className="flex h-full flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      <GlobalChatSidebar profile={profile} />
    </div>
  );
}
