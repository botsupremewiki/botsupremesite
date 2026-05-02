import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { TCG_GAMES } from "@shared/types";

// Wonder Pick a été refondu : la section vit maintenant dans la page
// /boosters (1 carte/membre dans le pool, 1 pick/jour, choix sur 5 face
// cachée). Cette ancienne URL est conservée pour les liens externes
// (palette de commande, bookmarks) et redirige.

export const dynamic = "force-static";

export default async function WonderPickRedirect({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  redirect(`/play/tcg/${gameId}/boosters`);
}
