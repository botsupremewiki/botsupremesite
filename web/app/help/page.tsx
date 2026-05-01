import Link from "next/link";
import { getLocale, getT } from "@/lib/i18n";
import { FAQ_FR, FAQ_EN } from "./faq-data";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const locale = await getLocale();
  const t = await getT();
  const FAQ = locale === "en" ? FAQ_EN : FAQ_FR;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 text-sm">
        <Link
          href="/"
          className="text-zinc-400 transition-colors hover:text-zinc-100"
        >
          ← {t("common.home")}
        </Link>
        <span className="font-semibold">{t("help.title")}</span>
        <Link
          href="/changelog"
          className="text-xs text-zinc-400 hover:text-zinc-100"
        >
          {t("common.changelog")}
        </Link>
      </header>
      <main
        id="main-content"
        className="flex flex-1 flex-col items-center overflow-y-auto p-6"
      >
        <div className="w-full max-w-2xl">
          <h1 className="text-3xl font-bold text-zinc-100">
            {t("help.title")}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{t("help.subtitle")}</p>
          <div className="mt-6 flex flex-col gap-2">
            {FAQ.map((item, i) => (
              <details
                key={i}
                className="group rounded-xl border border-white/10 bg-black/40 p-4 transition-colors open:border-amber-300/40"
              >
                <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-100 group-open:text-amber-100">
                  <span className="mr-2 text-zinc-500 group-open:text-amber-300">
                    Q.
                  </span>
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
