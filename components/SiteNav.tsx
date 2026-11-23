"use client";

import { useEffect, useState } from "react";

const LINKS = [
  { href: "#calculator", label: "Calculator" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

/** Sticky local nav. Inline links on desktop (lg+); a hamburger menu on phones and tablets. */
export function SiteNav({ siteName }: { siteName: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onResize = () => window.innerWidth >= 1024 && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <nav aria-label="Site" className="sticky top-0 z-30">
      <div className={`border-b border-hairline backdrop-blur-xl ${open ? "bg-frost" : "bg-canvas/90"}`}>
        <div className="mx-auto flex h-13 max-w-[980px] items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#top" onClick={() => setOpen(false)} className="truncate font-display text-nav-title font-semibold">
            {siteName}
          </a>

          {/* Desktop */}
          <div className="hidden items-center gap-6 lg:flex">
            {LINKS.slice(1).map((l) => (
              <a key={l.href} href={l.href} className="text-caption text-ink/80 hover:text-ink">
                {l.label}
              </a>
            ))}
            <a href="#calculator" className="rounded-pill bg-action px-3.5 py-1.5 text-caption text-white">
              Check courses
            </a>
          </div>

          {/* Phones & tablets */}
          <div className="flex items-center gap-2 lg:hidden">
            <a href="#calculator" onClick={() => setOpen(false)} className="hidden rounded-pill bg-action px-3.5 py-1.5 text-caption text-white sm:inline-block">
              Check courses
            </a>
            <button
              type="button"
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen(!open)}
              className="-mr-2 flex h-11 w-11 items-center justify-center"
            >
              <span aria-hidden className="relative block h-3 w-[18px]">
                <span className={`absolute left-0 h-px w-full bg-ink transition-transform duration-200 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
                <span className={`absolute left-0 top-1.5 h-px w-full bg-ink transition-opacity duration-200 ${open ? "opacity-0" : ""}`} />
                <span className={`absolute left-0 h-px w-full bg-ink transition-transform duration-200 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <>
          <div id="site-menu" className="absolute inset-x-0 top-full border-b border-control bg-frost lg:hidden">
            <ul className="mx-auto max-w-[980px] px-4 pb-8 pt-4 sm:px-6">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setOpen(false)} className="block py-2.5 font-display text-title font-semibold">
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="mt-6 sm:hidden">
                <a href="#calculator" onClick={() => setOpen(false)} className="inline-block rounded-pill bg-action px-6 py-3 text-body-tight text-white">
                  Check your courses
                </a>
              </li>
            </ul>
          </div>
          {/* Tap outside to close */}
          <button type="button" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 top-13 -z-10 cursor-default bg-ink/20 lg:hidden" />
        </>
      )}
    </nav>
  );
}
