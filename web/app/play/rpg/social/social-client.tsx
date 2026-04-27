"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ETERNUM_CLASSES,
  ETERNUM_ELEMENTS,
  type EternumClassId,
  type EternumElementId,
  type EternumHero,
} from "@shared/types";
import {
  buildHeroUnit,
  type CombatUnit,
} from "@shared/eternum-combat";
import { AtbBattleModal } from "@/components/eternum/atb-battle";
import {
  ETERNUM_FAMILIERS_BY_ID,
  RARITY_ACCENT,
} from "@shared/eternum-familiers";
import { createClient } from "@/lib/supabase/client";
import type { Friend, FriendRequest, Guild, GuildBoss } from "./page";

type Tab = "guild" | "friends";

type FamilierForLend = {
  id: string;
  familier_id: string;
  element_id: string;
  level: number;
  star: number;
  team_slot: number | null;
};

export function SocialClient({
  myGuild,
  allGuilds,
  hasGuild,
  guildBoss,
  friends,
  requests,
  hero,
  myFamiliers,
}: {
  myGuild: Guild | null;
  allGuilds: Guild[];
  hasGuild: boolean;
  guildBoss: GuildBoss | null;
  friends: Friend[];
  requests: FriendRequest[];
  hero: EternumHero;
  myFamiliers: FamilierForLend[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("guild");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 overflow-hidden">
      {(error || okMsg) && (
        <div
          className={`shrink-0 rounded-md border px-3 py-2 text-sm ${
            error
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
          }`}
        >
          {error ?? okMsg}
        </div>
      )}

      <div className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 pb-2">
        <TabBtn active={tab === "guild"} onClick={() => setTab("guild")}>
          🏰 Guilde {myGuild ? `[${myGuild.tag}]` : ""}
        </TabBtn>
        <TabBtn active={tab === "friends"} onClick={() => setTab("friends")}>
          👫 Amis ({friends.length})
          {requests.length > 0 && (
            <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
              {requests.length}
            </span>
          )}
        </TabBtn>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {tab === "guild" && (
          <GuildView
            myGuild={myGuild}
            allGuilds={allGuilds}
            hasGuild={hasGuild}
            guildBoss={guildBoss}
            hero={hero}
            supabase={supabase}
            setError={setError}
            setOkMsg={setOkMsg}
            router={router}
          />
        )}
        {tab === "friends" && (
          <FriendsView
            friends={friends}
            requests={requests}
            myFamiliers={myFamiliers}
            supabase={supabase}
            setError={setError}
            setOkMsg={setOkMsg}
            router={router}
          />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100"
          : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Guilde + Boss de guilde ─────────────────────────────────────────

function GuildView({
  myGuild,
  allGuilds,
  hasGuild,
  guildBoss,
  hero,
  supabase,
  setError,
  setOkMsg,
  router,
}: {
  myGuild: Guild | null;
  allGuilds: Guild[];
  hasGuild: boolean;
  guildBoss: GuildBoss | null;
  hero: EternumHero;
  supabase: ReturnType<typeof createClient>;
  setError: (s: string | null) => void;
  setOkMsg: (s: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [bossSession, setBossSession] = useState<{
    teamA: CombatUnit[];
    teamB: CombatUnit[];
    damage: number;
    hpLeft: number;
    tier: number;
  } | null>(null);

  async function createGuild() {
    if (!supabase) return;
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_create_guild", {
      p_name: name,
      p_tag: tag,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.refresh();
  }
  async function joinGuild(guildId: string) {
    if (!supabase) return;
    const { error: rpcErr } = await supabase.rpc("eternum_join_guild", {
      p_guild_id: guildId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    router.refresh();
  }
  async function leaveGuild() {
    if (!supabase || !confirm("Quitter ta guilde ?")) return;
    await supabase.rpc("eternum_leave_guild");
    router.refresh();
  }

  async function attackBoss() {
    if (!supabase) return;
    setError(null);
    setBossSession(null);

    // ⚠️ Server-authoritative — dmg calculé server-side.
    const { data, error: rpcErr } = await supabase.rpc(
      "eternum_attempt_guild_boss",
    );
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as
      | { ok: true; damage: number; hp_left: number; tier: number }
      | { ok: false; error: string };
    if (!r.ok) {
      setError(r.error);
      return;
    }

    const tier = r.tier;
    const teamA: CombatUnit[] = [
      buildHeroUnit(
        "hero",
        ETERNUM_CLASSES[hero.classId].name + " (Toi)",
        hero.classId,
        hero.elementId,
        hero.level,
        "A",
      ),
    ];
    const teamB: CombatUnit[] = [
      {
        id: "guild-boss",
        name: `Boss de guilde T${tier}`,
        isHero: false,
        team: "B",
        classId: "warrior" as EternumClassId,
        element: "dark" as EternumElementId,
        level: 50 + tier * 10,
        hp: 50000 * tier,
        hpMax: 50000 * tier,
        atk: 80 * tier,
        def: 30 * tier,
        spd: 18,
        alive: true,
        ultimateReady: false,
        atkBuffTurns: 0,
        defDownTurns: 0,
      },
    ];

    setBossSession({
      teamA,
      teamB,
      damage: r.damage,
      hpLeft: r.hp_left,
      tier,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Ma guilde */}
      <section className="rounded-xl border border-emerald-400/30 bg-black/40 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
          Ma guilde
        </div>
        {myGuild ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-bold text-emerald-200">
                [{myGuild.tag}] {myGuild.name}
              </div>
              <div className="text-xs text-zinc-400">
                Niveau {myGuild.level} · Banque :{" "}
                {myGuild.bank_gold.toLocaleString("fr-FR")} OS
              </div>
            </div>
            <button
              onClick={leaveGuild}
              className="rounded-md bg-rose-500/20 px-3 py-1.5 text-xs text-rose-200 hover:bg-rose-500/30"
            >
              Quitter
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500">
                Nom (3-30 chars)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100"
              />
            </div>
            <div className="w-24">
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500">
                Tag (2-5)
              </label>
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value.toUpperCase())}
                maxLength={5}
                className="mt-0.5 w-full rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100"
              />
            </div>
            <button
              onClick={createGuild}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
            >
              Créer
            </button>
          </div>
        )}
      </section>

      {/* Boss de guilde */}
      {myGuild && (
        <section className="rounded-xl border border-rose-400/40 bg-black/40 p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-bold text-rose-200">
                🐉 Boss de guilde — Tier {guildBoss?.boss_tier ?? 1}
              </div>
              <div className="text-xs text-zinc-400">
                HP restant :{" "}
                {(guildBoss?.boss_hp_remaining ?? 50000).toLocaleString("fr-FR")}
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">
                Reset hebdo. Récompense par attaque : 1 OS / 50 dmg × tier.
              </div>
            </div>
            <button
              onClick={attackBoss}
              className="rounded-md bg-rose-500 px-4 py-2 text-sm font-bold text-rose-950 hover:bg-rose-400"
            >
              ⚔️ Attaquer
            </button>
          </div>
        </section>
      )}

      <AtbBattleModal
        open={bossSession !== null}
        teamA={bossSession?.teamA ?? []}
        teamB={bossSession?.teamB ?? []}
        forcedWinner="B"
        ambiance="boss"
        title={
          bossSession ? `🐉 Boss de guilde Tier ${bossSession.tier}` : ""
        }
        rewards={
          bossSession
            ? {
                custom: `⚔️ ${bossSession.damage.toLocaleString("fr-FR")} dégâts infligés · HP boss restant : ${bossSession.hpLeft.toLocaleString("fr-FR")}`,
              }
            : undefined
        }
        onComplete={() => {
          if (bossSession) {
            setOkMsg(
              `+${bossSession.damage} dmg infligés au boss de guilde T${bossSession.tier}`,
            );
          }
          setBossSession(null);
          router.refresh();
        }}
        closeLabel="Continuer"
      />

      {/* Liste guildes */}
      {!hasGuild && (
        <section className="flex flex-col rounded-xl border border-white/10 bg-black/40">
          <div className="border-b border-white/5 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-400">
            🏰 Guildes existantes (top 20)
          </div>
          <div className="p-3">
            {allGuilds.length === 0 ? (
              <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
                Aucune guilde encore. Crée la première !
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {allGuilds.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between rounded border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"
                  >
                    <span>
                      [<span className="text-emerald-300">{g.tag}</span>] {g.name} ·{" "}
                      Niv {g.level}
                    </span>
                    <button
                      onClick={() => joinGuild(g.id)}
                      className="rounded-md bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/30"
                    >
                      Rejoindre
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Amis ──────────────────────────────────────────────────────────

function FriendsView({
  friends,
  requests,
  myFamiliers,
  supabase,
  setError,
  setOkMsg,
  router,
}: {
  friends: Friend[];
  requests: FriendRequest[];
  myFamiliers: FamilierForLend[];
  supabase: ReturnType<typeof createClient>;
  setError: (s: string | null) => void;
  setOkMsg: (s: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; username: string }[]>([]);
  const [lendingTo, setLendingTo] = useState<Friend | null>(null);

  async function lend(friend: Friend, familierOwnedId: string) {
    if (!supabase) return;
    setError(null);
    const { error: rpcErr } = await supabase.rpc("eternum_lend_familier", {
      p_borrower_id: friend.friend_id,
      p_familier_owned_id: familierOwnedId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setOkMsg(`Familier prêté à ${friend.username}`);
    setLendingTo(null);
    router.refresh();
  }

  async function searchUsers() {
    if (!supabase || search.trim().length < 2) return;
    setError(null);
    const { data } = await supabase.rpc("eternum_search_user", {
      p_query: search,
    });
    setResults((data ?? []) as { id: string; username: string }[]);
  }

  async function sendRequest(targetId: string) {
    if (!supabase) return;
    const { error: rpcErr } = await supabase.rpc("eternum_friend_request", {
      p_target: targetId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setOkMsg("Demande envoyée.");
  }

  async function acceptRequest(requesterId: string) {
    if (!supabase) return;
    await supabase.rpc("eternum_friend_accept", { p_requester: requesterId });
    router.refresh();
  }
  async function declineRequest(requesterId: string) {
    if (!supabase) return;
    await supabase.rpc("eternum_friend_decline", { p_requester: requesterId });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Recherche */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
          🔍 Ajouter un ami
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Username (min 2 chars)"
            className="flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-sm text-zinc-100"
          />
          <button
            onClick={searchUsers}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-bold text-emerald-950 hover:bg-emerald-400"
          >
            Rechercher
          </button>
        </div>
        {results.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {results.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"
              >
                <span>{r.username}</span>
                <button
                  onClick={() => sendRequest(r.id)}
                  className="rounded-md bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/30"
                >
                  Demander
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Demandes reçues */}
      {requests.length > 0 && (
        <section className="rounded-xl border border-amber-400/40 bg-black/40 p-4">
          <div className="mb-2 text-[11px] uppercase tracking-widest text-amber-300">
            📩 Demandes reçues ({requests.length})
          </div>
          <div className="flex flex-col gap-1">
            {requests.map((r) => (
              <div
                key={r.requester_id}
                className="flex items-center justify-between rounded border border-amber-400/30 bg-amber-400/[0.04] px-3 py-2 text-xs"
              >
                <span>{r.username ?? r.requester_id.slice(0, 8)}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => acceptRequest(r.requester_id)}
                    className="rounded bg-emerald-500/30 px-2 py-1 text-emerald-200 hover:bg-emerald-500/50"
                  >
                    ✓ Accepter
                  </button>
                  <button
                    onClick={() => declineRequest(r.requester_id)}
                    className="rounded bg-rose-500/30 px-2 py-1 text-rose-200 hover:bg-rose-500/50"
                  >
                    ✗ Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mes amis */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-zinc-400">
          👫 Mes amis
        </div>
        {friends.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
            Aucun ami pour l&apos;instant.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {friends.map((f) => {
              const cls = f.class_id ? ETERNUM_CLASSES[f.class_id as EternumClassId] : null;
              const elt = f.element_id ? ETERNUM_ELEMENTS[f.element_id as EternumElementId] : null;
              return (
                <div
                  key={f.friend_id}
                  className="flex items-center justify-between rounded border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"
                >
                  <span>
                    {cls?.glyph ?? "❓"} {elt?.glyph ?? ""} <strong>{f.username}</strong>{" "}
                    {f.level && <span className="text-zinc-500">— niv {f.level}</span>}
                  </span>
                  <button
                    onClick={() => setLendingTo(f)}
                    className="rounded-md bg-amber-500/20 px-2 py-1 text-[11px] text-amber-200 hover:bg-amber-500/30"
                  >
                    🤝 Prêter
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Picker modal de prêt de familier */}
      {lendingTo && (
        <LendPicker
          friend={lendingTo}
          myFamiliers={myFamiliers}
          onClose={() => setLendingTo(null)}
          onPick={(famOwnedId) => lend(lendingTo, famOwnedId)}
        />
      )}
    </div>
  );
}

function LendPicker({
  friend,
  myFamiliers,
  onClose,
  onPick,
}: {
  friend: Friend;
  myFamiliers: FamilierForLend[];
  onClose: () => void;
  onPick: (famOwnedId: string) => void;
}) {
  // On ne peut pas prêter un familier déjà dans l'équipe active
  const lendable = myFamiliers.filter((f) => f.team_slot === null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-amber-400/40 bg-zinc-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-bold text-amber-200">
              🤝 Prêter un familier à {friend.username}
            </div>
            <div className="text-[11px] text-zinc-400">
              Le familier sera inutilisable pour toi pendant 24 h. 1 prêt par
              jour par familier.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-300 hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        {lendable.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
            Aucun familier prêtable. Retire-le de ton équipe d&apos;abord.
          </div>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {lendable.map((fam) => {
              const def = ETERNUM_FAMILIERS_BY_ID.get(fam.familier_id);
              const accent = def
                ? RARITY_ACCENT[def.rarity]
                : "border-white/10 text-zinc-300";
              return (
                <button
                  key={fam.id}
                  onClick={() => onPick(fam.id)}
                  className={`flex flex-col items-start rounded-md border bg-white/[0.03] p-2 text-left text-xs transition-colors hover:bg-white/[0.07] ${accent}`}
                >
                  <span className="text-2xl">{def?.glyph ?? "🐾"}</span>
                  <span className="font-semibold">
                    {def?.name ?? fam.familier_id}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    Niv {fam.level} · {"⭐".repeat(fam.star)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
