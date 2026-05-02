"use client";

/**
 * ProfilePopupContext : permet d'ouvrir la popup profil depuis n'importe
 * quel composant (chat, leaderboards, sièges casino…) sans navigation.
 *
 * Usage :
 *   const { open } = useProfilePopup();
 *   open("rimkidinki"); // affiche la popup pour ce username
 *
 * Le provider doit être monté à la racine (cf. layout play). La popup
 * elle-même est rendue par <ProfilePopupHost /> qui consomme le context.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type ProfilePopupContextValue = {
  /** Ouvre la popup pour le username donné. */
  open: (username: string) => void;
  /** Username actuellement affiché, null si fermé. */
  current: string | null;
  /** Ferme la popup. */
  close: () => void;
};

const ProfilePopupContext = createContext<ProfilePopupContextValue | null>(
  null,
);

export function ProfilePopupProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<string | null>(null);
  const open = useCallback((username: string) => {
    setCurrent(username);
  }, []);
  const close = useCallback(() => {
    setCurrent(null);
  }, []);
  return (
    <ProfilePopupContext.Provider value={{ open, current, close }}>
      {children}
    </ProfilePopupContext.Provider>
  );
}

export function useProfilePopup(): ProfilePopupContextValue {
  const ctx = useContext(ProfilePopupContext);
  if (!ctx) {
    // Fallback safe : si le provider n'est pas monté (ex. page hors
    // /play), on retourne un no-op qui navigue vers /u/{username}
    // pour ne pas casser l'expérience.
    return {
      open: (username: string) => {
        if (typeof window !== "undefined") {
          window.location.href = `/u/${encodeURIComponent(username)}`;
        }
      },
      current: null,
      close: () => {},
    };
  }
  return ctx;
}
