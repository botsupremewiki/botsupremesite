"use client";

import { createContext, useCallback, useContext, useState } from "react";
import type { ChatMessage } from "@shared/types";

export type ProximityChat = {
  label: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  enabled: boolean;
};

type Ctx = {
  proximity: ProximityChat | null;
  setProximity: (p: ProximityChat | null) => void;
};

const ProximityChatContext = createContext<Ctx>({
  proximity: null,
  setProximity: () => {},
});

/** Provider client : permet aux pages multijoueur (ex: battle TCG) de
 *  s'enregistrer pour pousser leur chat dans le sidebar global du layout
 *  parent. Les pages "menu" peuvent ignorer ce hook. */
export function ProximityChatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [proximity, setProximityState] = useState<ProximityChat | null>(
    null,
  );
  const setProximity = useCallback((p: ProximityChat | null) => {
    setProximityState(p);
  }, []);
  return (
    <ProximityChatContext.Provider value={{ proximity, setProximity }}>
      {children}
    </ProximityChatContext.Provider>
  );
}

export function useProximityChat() {
  return useContext(ProximityChatContext).proximity;
}

/** À appeler depuis les pages multijoueur pour fournir leur chat au
 *  sidebar global. Le composant consommateur (GlobalChatSidebar via le
 *  context) affichera l'onglet "Proximity" automatiquement. */
export function useRegisterProximityChat(p: ProximityChat | null) {
  const setProximity = useContext(ProximityChatContext).setProximity;
  // useEffect pour s'enregistrer au mount, désinscrire au unmount.
  useStableEffect(() => {
    setProximity(p);
    return () => setProximity(null);
  }, [
    p?.label,
    p?.messages,
    p?.onSend,
    p?.enabled,
    setProximity,
  ]);
}

// Helper local : useEffect basique mais déclaré ici pour clarté.
import { useEffect } from "react";
function useStableEffect(
  cb: () => void | (() => void),
  deps: React.DependencyList,
) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(cb, deps);
}
