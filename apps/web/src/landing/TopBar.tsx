import { useEffect, useState } from "react";
import { Button } from "@/ui/Button";
import { Logo } from "@/ui/Logo";
import { SoundToggle } from "@/ui/SoundToggle";
import { TestnetPill } from "@/ui/TestnetPill";

/** Sticky 64 px bar; the ink rule appears only once the page has scrolled under it. */
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
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 md:px-8">
        <a href="/" aria-label="SAYSO home" className="-ml-1 mr-auto rounded-lg px-1 py-[7px]">
          <Logo height={30} className="h-[30px] w-auto md:h-9" />
        </a>
        <TestnetPill className="mr-1" />
        <SoundToggle />
        <Button href="/arena" className="max-[359px]:hidden">
          Play
        </Button>
      </div>
    </header>
  );
}
