import { getProfile } from "@/lib/auth";
import { GlobalChatSidebar } from "./global-chat-sidebar";

/** Shared layout wrapper : zone de jeu (children) à gauche en flex-1,
 *  chat sidebar globale (Global + DMs) à droite. À utiliser dans les
 *  layouts /play/{tcg,casino,…}/layout.tsx pour uniformiser. */
export async function WithGlobalChat({
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
