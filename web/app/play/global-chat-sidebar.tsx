"use client";

import { useMemo } from "react";
import type { Profile } from "@/lib/auth";
import { hasRole } from "@/lib/discord-roles";
import { ChatPanel, type ChatChannel } from "./chat-panel";
import { useAuxChat } from "./use-aux-chat";
import { useDmHub } from "./use-dm-hub";
import { DmView } from "./dm-view";

/**
 * Sidebar chat dispo sur les pages "interface" (TCG, RPG…) — zones sans
 * avatars. 3-4 onglets selon le contexte :
 *  - proximity : injecté par certaines pages (combat Pokémon, etc.)
 *  - zone : chat persistant pour la section (TCG, …) si zoneId fourni
 *  - global : chat site-wide
 *  - dms : direct messages
 */
export function GlobalChatSidebar({
  profile,
  zoneId,
  zoneLabel,
  proximity,
}: {
  profile: Profile | null;
  zoneId?: string;
  zoneLabel?: string;
  proximity?: {
    label: string;
    messages: import("@shared/types").ChatMessage[];
    onSend: (text: string) => void;
    enabled: boolean;
  };
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

  const zoneChat = useAuxChat({
    partyName: "zone",
    room: zoneId ?? "disabled",
    query: {
      name: profile?.username,
      authId: profile?.id,
    },
    enabled: !!profile && !!zoneId,
  });

  const dmHub = useDmHub({
    authId: profile?.id ?? null,
    username: profile?.username ?? null,
    enabled: !!profile,
  });

  const channels = useMemo<ChatChannel[]>(() => {
    const list: ChatChannel[] = [];
    if (proximity) {
      list.push({
        id: "proximity",
        label: proximity.label,
        messages: proximity.messages,
        onSend: proximity.enabled ? proximity.onSend : undefined,
      });
    }
    if (zoneId && zoneLabel) {
      list.push({
        id: "zone",
        label: zoneLabel,
        messages: zoneChat.messages,
        onSend:
          zoneChat.status === "connected" ? zoneChat.send : undefined,
        disabledReason: !profile
          ? "Connecte-toi pour discuter."
          : undefined,
      });
    }
    list.push({
      id: "global",
      label: "Global",
      messages: globalChat.messages,
      onSend: globalChat.send,
      disabledReason: !profile ? "Connecte-toi pour discuter." : undefined,
    });
    list.push({
      id: "dms",
      label: "DMs",
      messages: [],
      disabledReason: !profile ? "Connecte-toi pour discuter." : undefined,
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    globalChat.messages,
    globalChat.send,
    zoneChat.messages,
    zoneChat.send,
    zoneChat.status,
    proximity?.messages,
    proximity?.onSend,
    proximity?.enabled,
    proximity?.label,
    zoneId,
    zoneLabel,
    profile,
  ]);

  return (
    <ChatPanel
      channels={channels}
      connected={globalChat.status === "connected"}
      currentUser={
        profile
          ? {
              username: profile.username,
              isAdmin: !!profile.is_admin,
              isBooster: hasRole(profile, "BOOSTER"),
            }
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
                selfIsBooster={hasRole(profile, "BOOSTER")}
              />
            )
          : undefined
      }
    />
  );
}
