import { type ReactNode, useRef } from "react";
import { EpisodeFxProvider, ShakeZone } from "./EpisodeFx";
import { TicketDock } from "./TicketDock";
import { TicketSheet } from "./TicketSheet";
import { DESKTOP_QUERY, useMediaQuery } from "./useMediaQuery";

export type TicketLayout = "sheet" | "dock";

export type EpisodeLayoutProps = {
  /** `EpisodeHeader`. */
  header: ReactNode;
  /** `VideoStage`. */
  stage: ReactNode;
  /** `WordBoard` with `variant="episode"`. */
  board: ReactNode;
  /** `PositionStrip`. */
  position: ReactNode;
  /** The word the ticket is open for, or `null`. */
  ticketWord: string | null;
  /** The `Ticket` for `ticketWord`, told whether it renders in the phone sheet or desktop dock. */
  renderTicket: (layout: TicketLayout) => ReactNode;
  onTicketClose: () => void;
  /** Desktop height; defaults to the full viewport. */
  desktopHeight?: string;
};

/**
 * S3 composition (DESIGN section 5). Phone and tablet: clip on top, board, position strip, ticket
 * as a bottom sheet. Desktop (≥ 1024 px): a studio that fits the viewport without scrolling, with
 * the clip, position and docked ticket on the left (~60 %) and a 2×3 board of large cards on the
 * right. Provides shake and coin flights to everything inside.
 */
export function EpisodeLayout({
  header,
  stage,
  board,
  position,
  ticketWord,
  renderTicket,
  onTicketClose,
  desktopHeight = "100dvh",
}: EpisodeLayoutProps) {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  // The sheet keeps showing the last ticket while it slides away.
  const lastSheet = useRef<ReactNode>(null);
  if (!desktop && ticketWord !== null) lastSheet.current = renderTicket("sheet");

  if (desktop) {
    return (
      <EpisodeFxProvider>
        <div className="flex flex-col overflow-hidden bg-paper" style={{ height: desktopHeight }}>
          {header}
          <ShakeZone className="grid min-h-0 w-full flex-1 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 px-8 pt-2 pb-7 xl:gap-10 xl:px-12">
            <div className="flex min-h-0 flex-col gap-5">
              <div className="relative flex min-h-0 flex-1 justify-center [container-type:size]">
                <div className="h-fit w-[min(100cqw,calc(100cqh*16/9))]">{stage}</div>
              </div>
              <div
                className={`grid min-h-[284px] shrink-0 gap-5 ${ticketWord === null ? "grid-cols-[minmax(0,0.82fr)_minmax(0,1.5fr)]" : "grid-cols-1"}`}
              >
                {/* An open ticket takes the whole dock: the trade needs the room, and the
                    word's own card already wears the holding. */}
                {ticketWord === null ? <div className="min-h-0 self-start">{position}</div> : null}
                <TicketDock word={ticketWord} className="min-h-0">
                  {ticketWord === null ? null : renderTicket("dock")}
                </TicketDock>
              </div>
            </div>
            <div className="min-h-0">{board}</div>
          </ShakeZone>
        </div>
      </EpisodeFxProvider>
    );
  }

  return (
    <EpisodeFxProvider>
      <div className="min-h-dvh overflow-x-clip bg-paper pb-10">
        {header}
        <ShakeZone className="flex flex-col md:gap-7 md:px-8 md:pt-7">
          {stage}
          <div className="flex flex-col gap-5 px-6 pt-6 md:px-0 md:pt-0">
            {board}
            {position}
          </div>
        </ShakeZone>
        <TicketSheet word={ticketWord} onClose={onTicketClose}>
          {lastSheet.current}
        </TicketSheet>
      </div>
    </EpisodeFxProvider>
  );
}
