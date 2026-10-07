import { RevealGroup, RevealItem } from "./Reveal";

/** Typographic stickers only: no third-party logo files. */
const STACK: readonly { name: string; role: string; tilt: string }[] = [
  { name: "Monad", role: "the chain", tilt: "-rotate-3" },
  { name: "Kuru", role: "order books", tilt: "rotate-2" },
  { name: "Chainlink CRE", role: "settlement", tilt: "-rotate-1" },
  { name: "Mera", role: "passkeys", tilt: "rotate-3" },
  { name: "Envio", role: "live data", tilt: "-rotate-2" },
];

export function BuiltOn() {
  return (
    <section
      aria-labelledby="built-on-title"
      className="border-t-2 border-ink px-4 py-20 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-6xl text-center">
        <h2
          id="built-on-title"
          className="font-display-wide text-[40px] leading-[0.95] md:text-7xl"
        >
          Built on
        </h2>
        <RevealGroup className="mt-12 flex flex-wrap justify-center gap-x-4 gap-y-6 md:mt-16 md:gap-x-6">
          {STACK.map((item) => (
            <RevealItem key={item.name}>
              <p
                className={`sticker flex flex-col items-center px-6 py-4 md:px-8 md:py-5 ${item.tilt}`}
              >
                <span className="font-display-wide text-[28px] leading-none md:text-[40px]">
                  {item.name}
                </span>
                <span className="mt-1.5 text-sm text-ink-soft">{item.role}</span>
              </p>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
