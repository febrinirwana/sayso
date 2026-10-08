import { useEffect, useState } from "react";
import { Button } from "@/ui/Button";
import { Logo } from "@/ui/Logo";
import { SoundToggle } from "@/ui/SoundToggle";
import { TestnetPill } from "@/ui/TestnetPill";
import { scrollToSection } from "./scroll";

const LINKS = [
  { href: "#how-it-plays", label: "How it plays" },
  { href: "#try-it", label: "Try it" },
  { href: "#fair", label: "Why it's fair" },
  { href: "#faq", label: "FAQ" },
] as const;

/** Sticky 72 px bar over paper; the ink rule appears only once the page has scrolled under it. */
export function TopBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 border-b-2 bg-paper transition-[border-color] duration-200 ${
        scrolled ? "border-ink" : "border-transparent"
      }`}
    >
      <div className="flex h-16 w-full items-center gap-2 px-6 md:h-[72px] md:px-8 lg:px-12">
        <a href="/" aria-label="SAYSO home" className="-ml-1 mr-auto rounded-lg px-1 py-1.5">
          <Logo height={36} className="h-8 w-auto md:h-10" />
        </a>
        <nav aria-label="Sections" className="mr-4 hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(event) => scrollToSection(event, link.href.slice(1))}
              className="inline-flex h-11 items-center rounded-full px-4 text-[15px] font-semibold transition-colors duration-150 hover:bg-ink/5"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <TestnetPill className="mr-1 max-[359px]:hidden" />
        <SoundToggle />
        <Button href="/arena" variant="brand" className="ml-1 px-5">
          Play
        </Button>
      </div>
    </header>
  );
}
