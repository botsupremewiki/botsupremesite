"use client";

import type { Profile } from "@/lib/auth";
import { GlobalChatSidebar } from "./global-chat-sidebar";
import {
  ProximityChatProvider,
  useProximityChat,
} from "./proximity-chat-context";

/** Côté client : wrappe children + sidebar dans un ProximityChatProvider
 *  pour que les pages multijoueur enfants puissent injecter leur chat
 *  via `useRegisterProximityChat`. */
export function WithGlobalChatInner({
  children,
  profile,
  zoneId,
  zoneLabel,
}: {
  children: React.ReactNode;
  profile: Profile | null;
  zoneId?: string;
  zoneLabel?: string;
}) {
  return (
    <ProximityChatProvider>
      <div className="flex h-full flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
        <SidebarConsumer
          profile={profile}
          zoneId={zoneId}
          zoneLabel={zoneLabel}
        />
      </div>
    </ProximityChatProvider>
  );
}

function SidebarConsumer({
  profile,
  zoneId,
  zoneLabel,
}: {
  profile: Profile | null;
  zoneId?: string;
  zoneLabel?: string;
}) {
  const proximity = useProximityChat();
  return (
    <GlobalChatSidebar
      profile={profile}
      zoneId={zoneId}
      zoneLabel={zoneLabel}
      proximity={proximity ?? undefined}
    />
  );
}
