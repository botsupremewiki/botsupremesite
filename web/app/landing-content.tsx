"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const GAMES = [
  {
    name: "Casino",
    desc: "Blackjack, roulette, poker, slots, mines, Hi-Lo.",
    glow: "bg-rose-500",
  },
  {
    name: "RPG",
    desc: "Exploration, combats, donjons.",
    glow: "bg-amber-500",
  },
  {
    name: "Pokémon TCG",
    desc: "Duels de cartes multijoueur.",
    glow: "bg-emerald-500",
  },
  {
    name: "Jeux de cartes",
    desc: "Classiques et variantes.",
    glow: "bg-sky-500",
  },
  {
    name: "Médiéval",
    desc: "Construis ton royaume.",
    glow: "bg-indigo-500",
  },
  {
    name: "Tycoon",
    desc: "Gère tes commerces.",
    glow: "bg-fuchsia-500",
  },
];

export function LandingContent() {
  return (
    <>
      <section className="relative flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-12 text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-indigo-300/80"
        >
          Univers 2D multijoueur
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="max-w-4xl bg-gradient-to-br from-white via-zinc-100 to-indigo-300 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-7xl md:text-8xl"
        >
          Tous tes jeux,
          <br />
          un seul monde.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mx-auto mt-6 max-w-xl text-base text-zinc-400 sm:text-lg"
        >
          Entre dans la plaza, croise les autres joueurs, traverse un portail
          et lance une partie. Casino, RPG, cartes — tout est connecté.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
        >
          <Link
            href="/play"
            className="group relative inline-flex items-center gap-2 rounded-full bg-indigo-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-400 hover:shadow-xl hover:shadow-indigo-500/50"
          >
            Entrer dans le monde
            <span className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </Link>
          <a
            href="#games"
            className="inline-flex items-center rounded-full border border-white/10 px-7 py-3.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5"
          >
            Voir les jeux
          </a>
        </motion.div>
      </section>

      <section
        id="games"
        className="relative mx-auto w-full max-w-6xl px-6 pb-24"
      >
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Ce qui t&apos;attend
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Les mondes connectés à la plaza. D&apos;autres arrivent.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((g, i) => (
            <motion.div
              key={g.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-20%" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              whileHover={{ y: -3 }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm transition-colors hover:bg-white/[0.06]"
            >
              <div
                className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full ${g.glow} opacity-10 blur-3xl transition-opacity group-hover:opacity-25`}
              />
              <div className="relative">
                <div className="text-lg font-semibold text-zinc-100">
                  {g.name}
                </div>
                <div className="mt-1 text-sm text-zinc-400">{g.desc}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </>
  );
}
