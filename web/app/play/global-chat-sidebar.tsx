"use client";

import { useMemo } from "react";
import type { Profile } from "@/lib/auth";
import { ChatPanel, type ChatChannel } from "./chat-panel";
import { useAuxChat } from "./use-aux-chat";
import { useDmHub } from "./use-dm-hub";
import { DmView } from "./dm-view";

/**
 * Sidebar chat panel disponible sur toutes les pages /play hors plaza.
 * 2 canaux : Global (toutes les rooms) + DM (privés).
 */
export function GlobalChatSidebar({
  profile,
}: {
  profile: Profile | null;
}) {
  const globalChat = useAuxChat({
    partyName: "global",
    room: "main",
    query: {
      name: profile?.username,
      authId: profile?.id,
    },
    enabled: !!profile,
  });

  const dmHub = useDmHub({
    authId: profile?.id ?? null,
    username: profile?.username ?? null,
    enabled: !!profile,
  });

  const channels = useMemo<ChatChannel[]>(() => {
    return [
      {
        id: "global",
        label: "Global",
        messages: globalChat.messages,
        onSend: globalChat.send,
        disabledReason: !profile
          ? "Connecte-toi pour discuter."
          : undefined,
      },
      {
        id: "dms",
        label: "DMs",
        messages: [],
        disabledReason: !profile ? "Connecte-toi pour discuter." : undefined,
      },
    ];
  }, [globalChat.messages, globalChat.send, profile]);

  return (
    <ChatPanel
      channels={channels}
      connected={globalChat.status === "connected"}
      currentUser={
        profile
          ? { username: profile.username, isAdmin: !!profile.is_admin }
          : undefined
      }
      renderDm={
        profile
          ? () => (
              <DmView
                hub={dmHub}
                selfAuthId={profile.id}
                selfUsername={profile.username}
                selfIsAdmin={!!profile.is_admin}
              />
            )
          : undefined
      }
    />
  );
}
