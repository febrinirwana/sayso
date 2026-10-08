import { ArrowRight, CheckCircle2, Coins, ExternalLink, Layers3 } from "lucide-react";
import { Button } from "@/ui/Button";
import { Voxel } from "@/ui/Voxel";
import { amount, positionValue, price, shares } from "../results/format";
import { Money, RecordHeading, RecordTabs, Spinner } from "../results/RecordUi";
import type { PortfolioPosition } from "../results/types";

export type PortfolioProps = {
  tab: "open" | "history";
  onTabChange: (tab: "open" | "history") => void;
  positions: readonly PortfolioPosition[];
  redeemable: bigint;
  redeemState: "idle" | "sending" | "filled";
  onRedeemAll: () => void;
  onPlay: () => void;
  onPlayEpisode?: ((episodeId: string) => void) | undefined;
  historyUnavailable?: boolean;
};

export function Portfolio({
  tab,
  onTabChange,
  positions,
  redeemable,
  redeemState,
  onRedeemAll,
  onPlay,
  onPlayEpisode,
  historyUnavailable = false,
}: PortfolioProps) {
  const grouped = new Map<string, PortfolioPosition[]>();
  for (const position of positions) {
    const rows = grouped.get(position.episode.id) ?? [];
    rows.push(position);
    grouped.set(position.episode.id, rows);
  }
  const total = positions.reduce(
    (sum, position) =>
      sum +
      positionValue(
        position.yes,
        position.no,
        position.word.state,
        position.currentYesPriceBps ?? 0,
      ),
    0n,
  );
  const valueUnavailable = positions.some(
    (position) =>
      position.currentYesPriceBps === null &&
      (position.word.state === "Open" || position.word.state === "SaidPending"),
  );
  return (
    // Missing book prices stay unavailable rather than receiving a synthetic quote.
    <div className="pb-6">
      <RecordHeading
        eyebrow="Your calls / your collection"
        title="The word on your words."
        description="All your positions, from the first call to the final receipt."
      />
      <div className="mb-9 grid gap-5 lg:grid-cols-[1fr_1.15fr]">
        <section className="relative overflow-hidden rounded-3xl border-2 border-ink bg-sky-tint p-6 shadow-sticker sm:p-8">
          <Layers3 size={24} />
          <p className="mt-4 text-xs font-bold uppercase tracking-wider text-ink-soft">
            {tab === "open" ? "Current position value" : "Remaining position value"}
          </p>
          {valueUnavailable ? (
            <p className="relative z-10 mt-2 max-w-[70%] font-headline text-2xl sm:text-3xl">
              Book value unavailable
            </p>
          ) : (
            <Money
              value={total}
              className="mt-2 block font-headline text-[clamp(30px,3.5vw,48px)]"
            />
          )}
          <p className="mt-3 max-w-[70%] text-xs leading-relaxed text-ink-soft">
            {tab === "open"
              ? "Open values follow the book. Final values follow the outcome."
              : "History includes redeemed and settled calls."}
          </p>
          <Voxel
            name="money-1"
            size={100}
            className="absolute right-4 top-4 -rotate-12 opacity-90"
          />
        </section>
        <section className="flex flex-wrap items-center justify-between gap-5 rounded-3xl border-2 border-ink bg-mint-tint p-6 shadow-sticker sm:p-8">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
              <Coins size={17} />
              {redeemState === "filled" ? "Back in your balance" : "Ready to redeem"}
            </p>
            <Money
              value={redeemable}
              className="mt-3 block font-headline text-[clamp(30px,3.5vw,48px)]"
            />
            <p className="mt-2 text-xs text-ink-soft">Winning shares → practice tokens.</p>
          </div>
          <Button
            size="lg"
            disabled={redeemable === 0n || redeemState !== "idle"}
            onClick={onRedeemAll}
          >
            {redeemState === "sending" ? (
              <>
                <Spinner />
                Sending…
              </>
            ) : redeemState === "filled" ? (
              <>
                <CheckCircle2 size={18} />
                Redeemed
              </>
            ) : (
              "Redeem all"
            )}
          </Button>
        </section>
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <RecordTabs
          label="Portfolio view"
          value={tab}
          onChange={onTabChange}
          items={[
            { id: "open", label: "Open positions" },
            { id: "history", label: "History" },
          ]}
        />
        <p className="text-xs text-ink-soft">
          {positions.length} word positions · Envio read model
        </p>
      </div>
      {historyUnavailable && tab === "history" && (
        <p role="status" className="mb-5 text-sm text-ink-soft">
          History unavailable: Envio is offline. Only chain-visible holdings are shown.
        </p>
      )}
      {positions.length === 0 ? (
        <section className="grid items-center gap-6 rounded-[32px] border-2 border-ink bg-card p-8 shadow-sticker-lg md:grid-cols-2 lg:p-12">
          <div className="flex justify-center rounded-3xl bg-sun-tint py-6">
            <Voxel name="mystery-box" size={240} />
          </div>
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-soft">
              A clean slate
            </p>
            <h2 className="font-headline text-[clamp(30px,3vw,48px)] leading-tight">
              Your next good call starts here.
            </h2>
            <p className="my-5 max-w-md text-sm leading-relaxed text-ink-soft">
              {tab === "history"
                ? "Your completed calls will live here. Go give a word your best guess."
                : "Pick an episode, choose a word, and see where it takes you. Your positions will show up right here."}
            </p>
            <Button size="lg" onClick={onPlay}>
              Find an episode <ArrowRight size={18} />
            </Button>
          </div>
        </section>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped, ([id, rows]) => (
            <section
              key={id}
              className="overflow-hidden rounded-3xl border-2 border-ink bg-card shadow-sticker"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 bg-paper px-5 py-5 sm:px-7">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                    Episode {id}
                  </p>
                  <h2 className="mt-1 font-headline text-xl">{rows[0]?.episode.label}</h2>
                </div>
                {onPlayEpisode && (
                  <Button variant="secondary" onClick={() => onPlayEpisode(id)}>
                    Play <ArrowRight size={16} />
                  </Button>
                )}
                <span
                  className={`rounded-full border border-ink px-3 py-1 text-xs font-semibold ${rows[0]?.episode.state === "Live" ? "bg-said-tint" : "bg-sky-tint"}`}
                >
                  {rows[0]?.episode.state === "Live" ? "LIVE" : rows[0]?.episode.state}
                </span>
              </header>
              <div className="hidden grid-cols-[minmax(150px,1.6fr)_0.8fr_1fr_1fr_1fr_1.2fr] gap-4 border-y border-line px-7 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-soft lg:grid">
                <span>Word / your side</span>
                <span>Shares</span>
                <span>Average price</span>
                <span>Current price</span>
                <span>Value</span>
                <span>State</span>
              </div>
              <div className="divide-y divide-line">
                {rows.map((position) => (
                  <PositionRow key={position.id} position={position} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs leading-relaxed text-ink-soft">
        Balances come from the chain; Envio makes them readable. Prices are estimates, not
        guaranteed fills. All amounts are TESTNET.
      </p>
    </div>
  );
}
function PositionRow({ position }: { position: PortfolioPosition }) {
  const { word } = position;
  const final = word.state === "Yes" || word.state === "No" || word.state === "Void";
  const sides = (["yes", "no"] as const).filter((side) => position[side] > 0n);
  return (
    <div className="px-5 py-5 sm:px-7">
      {sides.length ? (
        sides.map((side) => {
          const bps =
            position.currentYesPriceBps === null
              ? null
              : side === "yes"
                ? position.currentYesPriceBps
                : 10_000 - position.currentYesPriceBps;
          const average = side === "yes" ? position.averageYesPriceBps : position.averageNoPriceBps;
          const value = positionValue(
            side === "yes" ? position.yes : 0n,
            side === "no" ? position.no : 0n,
            word.state,
            position.currentYesPriceBps ?? 0,
          );
          return (
            <div
              key={side}
              className="grid grid-cols-2 items-center gap-x-4 gap-y-4 py-2 lg:grid-cols-[minmax(150px,1.6fr)_0.8fr_1fr_1fr_1fr_1.2fr]"
            >
              <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
                <h3 className="font-headline break-words text-xl">{word.text}</h3>
                <span
                  className={`rounded-md px-2 py-1 text-[10px] font-bold ${side === "yes" ? "bg-gain-tint text-gain" : "bg-line"}`}
                >
                  {side.toUpperCase()}
                </span>
              </div>
              <div className="text-sm">
                <span className="mr-2 text-xs text-ink-soft lg:hidden">Shares</span>
                <b className="tabular break-all">{shares(position[side])}</b>
              </div>
              <div className="text-sm">
                <span className="mr-2 text-xs text-ink-soft lg:hidden">Avg</span>
                <b className="tabular">{average === null ? "—" : price(average)}</b>
                <span className="ml-1 text-[9px] text-ink-soft">TESTNET</span>
              </div>
              <div className="text-sm">
                <span className="mr-2 text-xs text-ink-soft lg:hidden">Now</span>
                {word.marketUrl && !final ? (
                  <a
                    className="inline-flex items-center gap-1 underline"
                    href={word.marketUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {bps === null ? "—" : price(bps)}
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <b className="tabular">
                    {final
                      ? word.state === "Void"
                        ? "50¢"
                        : (word.state === "Yes") === (side === "yes")
                          ? "100¢"
                          : "0¢"
                      : bps === null
                        ? "—"
                        : price(bps)}
                  </b>
                )}
                <span className="ml-1 text-[9px] text-ink-soft">TESTNET</span>
              </div>
              <div className="text-sm">
                <span className="mr-2 text-xs text-ink-soft lg:hidden">Value</span>
                {!final && bps === null ? (
                  <span className="text-xs text-ink-soft">Unavailable</span>
                ) : (
                  <Money value={value} className="font-bold" />
                )}
              </div>
              <span
                className={`w-fit rounded-full border px-3 py-1.5 text-[11px] font-bold ${word.state === "Yes" ? "border-gain bg-gain-tint text-gain" : word.state === "SaidPending" ? "border-said bg-said-tint" : "border-line bg-paper"}`}
              >
                {word.state === "SaidPending"
                  ? "SAID · pending CRE"
                  : final
                    ? value > 0n
                      ? "Redeemable"
                      : "Settled"
                    : "Open"}
              </span>
            </div>
          );
        })
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-headline text-xl">{word.text}</h3>
          <p className="text-sm text-ink-soft">
            {amount(position.redeemed)} AUSD redeemed <b className="text-[9px]">TESTNET</b>
          </p>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-gain">
            <CheckCircle2 size={16} />
            Redeemed
          </span>
        </div>
      )}
    </div>
  );
}
