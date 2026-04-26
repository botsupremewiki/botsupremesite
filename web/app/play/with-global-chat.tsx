import { getProfile } from "@/lib/auth";
import { WithGlobalChatInner } from "./with-global-chat-inner";

/** Layout wrapper : zone de jeu (children) à gauche en flex-1, chat
 *  sidebar (Proximity? · Zone · Global · DMs) à droite. */
export async function WithGlobalChat({
  children,
  zoneId,
  zoneLabel,
}: {
  children: React.ReactNode;
  /** Identifiant pour le chat zone (party "zone" room=zoneId). */
  zoneId?: string;
  /** Libellé d'onglet pour la zone (ex "TCG"). Requis avec zoneId. */
  zoneLabel?: string;
}) {
  const profile = await getProfile();
  return (
    <WithGlobalChatInner
      profile={profile}
      zoneId={zoneId}
      zoneLabel={zoneLabel}
    >
      {children}
    </WithGlobalChatInner>
  );
}
