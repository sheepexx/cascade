import { Fragment } from "react";
import { useLocale } from "../lib/i18n";
import { localePath } from "../lib/i18n/core";

/**
 * The text under the start screen: who makes Cascade, a way into the docs,
 * what it does, the FAQ and the guides. It is real content for visitors and
 * for search engines, so it renders with the start screen rather than behind
 * a click.
 */

const LANDING_DO_KEYS = [
  "landing.do1",
  "landing.do2",
  "landing.do3",
  "landing.do4",
  "landing.do5",
  "landing.do6",
  "landing.do7",
  "landing.do8",
  "landing.do9",
  "landing.do10",
] as const;

const LANDING_FAQ_KEYS = [
  ["landing.faqQ1", "landing.faqA1"],
  ["landing.faqQ2", "landing.faqA2"],
  ["landing.faqQ3", "landing.faqA3"],
  ["landing.faqQ4", "landing.faqA4"],
  ["landing.faqQ5", "landing.faqA5"],
  ["landing.faqQ6", "landing.faqA6"],
] as const;

const LANDING_GUIDES = [
  { href: "/docs/how-to-make-an-osu-mania-map", key: "landing.guide1" },
  { href: "/docs/osu-to-stepmania", key: "landing.guide2" },
  { href: "/docs/osu-mania-map-viewer", key: "landing.guide3" },
  { href: "/docs/osu-mania-pack-creator", key: "landing.guide4" },
] as const;

function LandingText({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="text-slate-300">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function LandingCopy() {
  const { locale, t } = useLocale();
  const docsHref = localePath(locale, "/docs");
  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 pt-8 text-xs text-slate-500">
        <p>
          {t("empty.madeBy")}{" "}
          <a
            href="https://osu.ppy.sh/u/sheepex_"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-slate-300 transition hover:text-accent"
          >
            sheepex_
          </a>
        </p>
        <p>
          {t("empty.contributors")}{" "}
          <a
            href="https://github.com/kaanreal"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-slate-300 transition hover:text-accent"
          >
            kaanreal
          </a>
        </p>
        <a
          href="https://ko-fi.com/sheepex"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-slate-400 transition hover:text-accent"
        >
          {t("empty.support")}
        </a>
      </div>

      <div className="flex justify-center px-5 pt-6">
        <a
          href={docsHref}
          className="inline-flex items-center gap-2.5 rounded-xl border border-white/10 bg-ink-700/60 px-5 py-2.5 text-sm font-semibold text-slate-100 shadow-lg shadow-black/20 transition hover:border-accent/60 hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Zm16 0A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />
          </svg>
          {t("landing.docs")}
          <span className="text-xs font-normal text-slate-400">{t("landing.docsHint")}</span>
        </a>
      </div>

      <section className="mx-auto max-w-2xl px-5 pb-14 pt-6 text-left text-sm leading-relaxed text-slate-400">
        <h1 className="mb-3 text-xl font-bold text-slate-200">
          {t("landing.h1")}
        </h1>
        <p className="mb-2">
          <LandingText text={t("landing.intro")} />
        </p>

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {t("landing.doTitle")}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          {LANDING_DO_KEYS.map((key) => (
            <li key={key}>
              <LandingText text={t(key)} />
            </li>
          ))}
        </ul>

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {t("landing.faqTitle")}
        </h2>
        <dl>
          {LANDING_FAQ_KEYS.map(([question, answer]) => (
            <Fragment key={question}>
              <dt className="mt-3 font-semibold text-slate-300">
                {t(question)}
              </dt>
              <dd>
                <LandingText text={t(answer)} />
              </dd>
            </Fragment>
          ))}
        </dl>

        <h2 className="mb-2 mt-7 text-xs font-semibold uppercase tracking-widest text-slate-500">
          {t("landing.guidesTitle")}
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          {LANDING_GUIDES.map((guide) => (
            <li key={guide.href}>
              <a
                href={guide.href}
                className="text-slate-300 underline-offset-2 transition hover:text-accent hover:underline"
              >
                {t(guide.key)}
              </a>
            </li>
          ))}
          <li>
            <a
              href={docsHref}
              className="font-semibold text-slate-200 underline-offset-2 transition hover:text-accent hover:underline"
            >
              {t("landing.docsAll")}
            </a>
          </li>
        </ul>
      </section>
    </>
  );
}
