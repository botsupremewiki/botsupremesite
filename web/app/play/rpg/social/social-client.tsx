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
  simulateBattle,
  type CombatLog,
} from "@shared/eternum-combat";
import { createClient } from "@/lib/supabase/client";
import type { Friend, FriendRequest, Guild, GuildBoss } from "./page";

type Tab = "guild" | "friends";

export function SocialClient({
  myGuild,
  allGuilds,
  hasGuild,
  guildBoss,
  friends,
  requests,
  hero,
}: {
  myGuild: Guild | null;
  allGuilds: Guild[];
  hasGuild: boolean;
  guildBoss: GuildBoss | null;
  friends: Friend[];
  requests: FriendRequest[];
  hero: EternumHero;
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
  const [bossResult, setBossResult] = useState<{
    log: CombatLog[];
    damage: number;
    hpLeft: number;
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
    setBossResult(null);
    // Combat héros vs boss de guilde (scale par tier).
    const tier = guildBoss?.boss_tier ?? 1;
    const playerTeam = [
      buildHeroUnit(
        "hero",
        ETERNUM_CLASSES[hero.classId].name,
        hero.classId,
        hero.elementId,
        hero.level,
        "A",
      ),
    ];
    const boss = [
      {
        id: "guild-boss",
        name: `Boss de guilde T${tier}`,
        isHero: false,
        team: "B" as const,
        classId: "warrior" as EternumClassId,
        element: "dark" as EternumElementId,
        level: 50 + tier * 10,
        hp: guildBoss?.boss_hp_remaining ?? 50000,
        hpMax: guildBoss?.boss_hp_remaining ?? 50000,
        atk: 80 * tier,
        def: 30 * tier,
        spd: 18,
        alive: true,
        ultimateReady: false,
        atkBuffTurns: 0,
        defDownTurns: 0,
      },
    ];
    const battle = simulateBattle(playerTeam, boss, 30);
    const damage = battle.log
      .filter((l) => l.target === boss[0].name && l.damage)
      .reduce((s, l) => s + (l.damage ?? 0), 0);

    const { data, error: rpcErr } = await supabase.rpc("eternum_guild_boss_attack", {
      p_damage: damage,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    const r = data as { ok: boolean; hp_left: number; tier: number };
    setBossResult({ log: battle.log, damage, hpLeft: r.hp_left });
    setOkMsg(`+${damage} dmg infligés au boss de guilde T${r.tier}`);
    router.refresh();
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
          {bossResult && (
            <div className="mt-3 rounded-md border border-rose-400/30 bg-rose-400/[0.03] p-3 text-xs">
              <div className="text-rose-200">
                Dégâts infligés :{" "}
                <strong>{bossResult.damage.toLocaleString("fr-FR")}</strong> · HP
                restant : {bossResult.hpLeft.toLocaleString("fr-FR")}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-zinc-400">
                  Journal de combat
                </summary>
                <div className="mt-2 max-h-48 overflow-y-auto">
                  {bossResult.log.map((l, i) => (
                    <div key={i} className="text-[10px] text-zinc-300">
                      [T{l.turn}] {l.msg}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </section>
      )}

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
  supabase,
  setError,
  setOkMsg,
  router,
}: {
  friends: Friend[];
  requests: FriendRequest[];
  supabase: ReturnType<typeof createClient>;
  setError: (s: string | null) => void;
  setOkMsg: (s: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; username: string }[]>([]);

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
                  <span className="text-[10px] text-zinc-500">
                    Prêt familier 1×/jour · à venir
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
