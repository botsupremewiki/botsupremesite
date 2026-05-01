/**
 * Icon component : SVG inline sans dépendance externe (pas de
 * lucide-react / heroicons). Style cohérent (stroke-width 1.75,
 * round caps), accessible via aria-hidden + size auto.
 *
 * Usage :
 *   <Icon name="trash" size={16} />
 *   <Icon name="search" className="text-amber-300" />
 *
 * Pour ajouter une icône : copier le path d'icones.fr ou Lucide
 * (https://lucide.dev) dans la map ICON_PATHS ci-dessous.
 */

import type { CSSProperties } from "react";

export type IconName =
  | "search"
  | "settings"
  | "user"
  | "users"
  | "home"
  | "bell"
  | "trash"
  | "edit"
  | "plus"
  | "minus"
  | "check"
  | "x"
  | "chevron-right"
  | "chevron-left"
  | "chevron-up"
  | "chevron-down"
  | "arrow-right"
  | "arrow-left"
  | "send"
  | "share"
  | "copy"
  | "external"
  | "lock"
  | "unlock"
  | "eye"
  | "eye-off"
  | "heart"
  | "star"
  | "trophy"
  | "flag"
  | "info"
  | "alert-triangle"
  | "play"
  | "pause"
  | "skip-forward"
  | "skip-back"
  | "swords"
  | "coins"
  | "package"
  | "filter"
  | "sort"
  | "calendar"
  | "clock"
  | "moon"
  | "sun"
  | "monitor"
  | "log-out"
  | "menu"
  | "more-horizontal"
  | "spinner";

const ICON_PATHS: Record<IconName, string> = {
  search:
    "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z",
  settings:
    "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
  user:
    "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  users:
    "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
  home:
    "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  bell:
    "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
  trash:
    "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6",
  edit:
    "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18M6 6l12 12",
  "chevron-right": "M9 18l6-6-6-6",
  "chevron-left": "M15 18l-6-6 6-6",
  "chevron-up": "M18 15l-6-6-6 6",
  "chevron-down": "M6 9l6 6 6-6",
  "arrow-right": "M5 12h14M12 5l7 7-7 7",
  "arrow-left": "M19 12H5M12 19l-7-7 7-7",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  share:
    "M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13",
  copy:
    "M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1",
  external:
    "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3",
  lock:
    "M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2zM7 11V7a5 5 0 0110 0v4",
  unlock:
    "M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2zM7 11V7a5 5 0 019.9-1",
  eye:
    "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 100-6 3 3 0 000 6z",
  "eye-off":
    "M17.94 17.94A10.06 10.06 0 0112 20c-7 0-11-8-11-8a18.5 18.5 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24M1 1l22 22",
  heart:
    "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",
  star:
    "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  trophy:
    "M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0012 0V2z",
  flag:
    "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22V15",
  info: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-4M12 8h.01",
  "alert-triangle":
    "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
  play: "M5 3l14 9-14 9V3z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  "skip-forward": "M5 4l10 8-10 8V4zM19 5v14",
  "skip-back": "M19 20L9 12l10-8v16zM5 19V5",
  swords:
    "M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M15 5l4-4 2 2-4 4M11.5 11.5L9 14",
  coins:
    "M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v12M9 9h4a2 2 0 010 4h-4 5",
  package:
    "M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  sort: "M3 6h13M3 12h9M3 18h5M21 8l-4-4-4 4M17 4v16",
  calendar:
    "M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18",
  clock: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2",
  moon: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
  monitor:
    "M20 3H4a2 2 0 00-2 2v11a2 2 0 002 2h16a2 2 0 002-2V5a2 2 0 00-2-2zM8 21h8M12 17v4",
  "log-out":
    "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 12h18M3 6h18M3 18h18",
  "more-horizontal":
    "M12 13a1 1 0 100-2 1 1 0 000 2zM19 13a1 1 0 100-2 1 1 0 000 2zM5 13a1 1 0 100-2 1 1 0 000 2z",
  spinner:
    "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83",
};

type Props = {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  /** Si l'icône est purement décorative (texte adjacent qui décrit
   *  déjà l'action). Par défaut true. */
  decorative?: boolean;
  /** Label accessible si l'icône n'est PAS décorative. */
  label?: string;
};

export function Icon({
  name,
  size = 16,
  className = "",
  strokeWidth = 1.75,
  style,
  decorative = true,
  label,
}: Props) {
  const path = ICON_PATHS[name];
  if (!path) return null;
  const a11yProps = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": label ?? name };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${name === "spinner" ? "animate-spin" : ""} ${className}`}
      style={style}
      {...a11yProps}
    >
      {path.split(" M").map((segment, i) => (
        <path key={i} d={(i === 0 ? "" : "M") + segment} />
      ))}
    </svg>
  );
}
