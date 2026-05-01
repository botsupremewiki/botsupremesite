import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TCG_GAMES, type TcgGameId } from "@shared/types";
import { POKEMON_CARD_BY_ID } from "@shared/tcg-pokemon-sets";
import { UserPill } from "@/components/user-pill";

export const dynamic = "force-dynamic";

export default async function CardEncyclopediaPage({
  params,
}: {
  params: Promise<{ gameId: string; cardId: string }>;
}) {
  const { gameId, cardId } = await params;
  if (!(gameId in TCG_GAMES)) notFound();
  const game = TCG_GAMES[gameId as TcgGameId];

  // Pokémon only pour l'instant — extensible à OnePiece/Runeterra plus tard.
  const card = gameId === "pokemon" ? POKEMON_CARD_BY_ID.get(cardId) : null;
  if (!card) notFound();

  const profile = await getProfile();
  const supabase = await createClient();

  // Combien d'exemplaires je possède ?
  let myCount = 0;
  // Combien de joueurs jouent cette carte (sur le site) ?
  let usageCount = 0;
  if (supabase) {
    if (profile) {
      const { data } = await supabase
        .from("tcg_cards_owned")
        .select("count")
        .eq("user_id", profile.id)
        .eq("game_id", gameId)
        .eq("card_id", cardId)
        .maybeSingle();
      myCount = (data as { count?: number } | null)?.count ?? 0;
    }
    // Stat globale via meta (count distinct users).
    const { count } = await supabase
      .from("tcg_cards_owned")
      .select("user_id", { count: "exact", head: true })
      .eq("game_id", gameId)
      .eq("card_id", cardId);
    usageCount = count ?? 0;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <Link
            href={`/play/tcg/${gameId}/collection`}
            className="text-zinc-400 transition-colors hover:text-zinc-100"
          >
            ← Collection
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className={`font-semibold ${game.accent}`}>{game.name}</span>
          <span className="text-xs text-zinc-500">📖 {card.name}</span>
        </div>
        {profile ? (
          <UserPill profile={profile} variant="play" />
        ) : (
          <span className="text-xs text-zinc-500">Invité</span>
        )}
      </header>
      <main
        className={`flex flex-1 flex-col overflow-y-auto p-6 ${game.gradient}`}
      >
        <div className="mx-auto w-full max-w-4xl">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* ─── Image carte ─── */}
            <div className="flex flex-col items-center">
              {"image" in card && card.image ? (
                <Image
                  src={card.image}
                  alt={card.name}
                  width={367}
                  height={512}
                  priority
                  className="h-auto w-full max-w-sm rounded-xl border border-white/10 shadow-2xl"
                />
              ) : null}
              <div className="mt-3 text-center">
                <div className="text-xl font-bold text-zinc-100">
                  {card.name}
                </div>
                <div className="text-xs text-zinc-500">
                  {card.id} ·{" "}
                  {card.kind === "pokemon"
                    ? `${stageLabel(card.stage)} · ${typeLabel(card.type)}`
                    : trainerLabel(card.trainerType)}
                </div>
              </div>
            </div>

            {/* ─── Détails ─── */}
            <div className="flex flex-col gap-4">
              {/* Possession + usage */}
              <div className="grid grid-cols-3 gap-2">
                <Tile
                  label="J'en ai"
                  value={String(myCount)}
                  accent={
                    myCount > 0 ? "text-emerald-300" : "text-zinc-500"
                  }
                />
                <Tile
                  label="Joueurs site"
                  value={String(usageCount)}
                  accent="text-amber-300"
                />
                <Tile
                  label="Rareté"
                  value={rarityLabel(card.rarity)}
                  accent="text-violet-300"
                />
              </div>

              {/* Pokémon stats */}
              {card.kind === "pokemon" ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <h2 className="text-sm font-bold text-zinc-100">
                    Caractéristiques
                  </h2>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <Row label="PV" value={String(card.hp)} />
                    {card.weakness ? (
                      <Row
                        label="Faiblesse"
                        value={`${typeLabel(card.weakness)} +20`}
                      />
                    ) : null}
                    <Row
                      label="Coût retraite"
                      value={`${card.retreatCost} ⭐`}
                    />
                    {card.evolvesFrom ? (
                      <Row label="Évolue de" value={card.evolvesFrom} />
                    ) : null}
                    {card.isEx ? (
                      <Row label="EX" value="Oui (2 KO points)" />
                    ) : null}
                  </div>
                  {card.attacks && card.attacks.length > 0 ? (
                    <div className="mt-3">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                        Attaques
                      </h3>
                      <div className="mt-1.5 flex flex-col gap-2">
                        {card.attacks.map((a, i) => (
                          <div
                            key={i}
                            className="rounded-md border border-white/10 bg-white/[0.02] p-2"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-sm font-bold text-zinc-100">
                                {a.name}
                              </span>
                              {a.damage != null ? (
                                <span className="text-sm font-bold tabular-nums text-rose-300">
                                  {a.damage}
                                  {a.damageSuffix ?? ""}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-zinc-500">
                              Coût :{" "}
                              {a.cost.length === 0
                                ? "—"
                                : a.cost.map(typeEmoji).join(" ")}
                            </div>
                            {a.text ? (
                              <div className="mt-1 text-[11px] text-zinc-300">
                                {a.text}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {card.ability ? (
                    <div className="mt-3 rounded-md border border-fuchsia-300/30 bg-fuchsia-300/5 p-2">
                      <div className="text-[10px] uppercase tracking-widest text-fuchsia-300">
                        ✨ Talent — {card.ability.name}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-300">
                        {card.ability.effect}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Trainer effect */}
              {card.kind === "trainer" ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <h2 className="text-sm font-bold text-zinc-100">
                    Effet
                  </h2>
                  <div className="mt-2 text-sm text-zinc-300">
                    {card.effect ?? "—"}
                  </div>
                </div>
              ) : null}

              {/* Lore */}
              {"description" in card && card.description ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                  <h2 className="text-sm font-bold text-zinc-100">
                    Pokédex
                  </h2>
                  <p className="mt-2 whitespace-pre-line text-sm italic text-zinc-300">
                    {card.description}
                  </p>
                </div>
              ) : null}

              {/* Crédits */}
              <div className="text-[10px] text-zinc-500">
                {"illustrator" in card && card.illustrator
                  ? `Illustration : ${card.illustrator}`
                  : null}
                {"pack" in card && card.pack
                  ? ` · Booster : ${card.pack}`
                  : null}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Tile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-2 text-center">
      <div className="text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/5 pb-1">
      <span className="text-[11px] uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <span className="font-semibold text-zinc-200">{value}</span>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  fire: "Feu",
  water: "Eau",
  grass: "Plante",
  lightning: "Électrique",
  psychic: "Psy",
  fighting: "Combat",
  darkness: "Obscurité",
  metal: "Métal",
  dragon: "Dragon",
  fairy: "Fée",
  colorless: "Incolore",
};

const TYPE_EMOJI: Record<string, string> = {
  fire: "🔥",
  water: "💧",
  grass: "🍃",
  lightning: "⚡",
  psychic: "🌀",
  fighting: "👊",
  darkness: "🌑",
  metal: "⚙️",
  dragon: "🐉",
  fairy: "✨",
  colorless: "⭐",
};

function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t;
}

function typeEmoji(t: string): string {
  return TYPE_EMOJI[t] ?? "⭐";
}

function stageLabel(s: string): string {
  return s === "basic"
    ? "De base"
    : s === "stage1"
      ? "Niveau 1"
      : s === "stage2"
        ? "Niveau 2"
        : s;
}

function trainerLabel(t: string | undefined): string {
  return t === "supporter"
    ? "Supporter"
    : t === "item"
      ? "Objet"
      : "Dresseur";
}

function rarityLabel(r: string): string {
  const m: Record<string, string> = {
    "diamond-1": "◆",
    "diamond-2": "◆◆",
    "diamond-3": "◆◆◆",
    "diamond-4": "◆◆◆◆",
    "star-1": "★",
    "star-2": "★★",
    "star-3": "★★★",
    crown: "👑",
    promo: "Promo",
  };
  return m[r] ?? r;
}
