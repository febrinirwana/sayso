import { useEffect, useRef, useState } from "react";
import { SETTLE_STAGGER, SettleDelayContext } from "./settle";
import { WordCard, type WordCardProps } from "./WordCard";

/** The six-word board: 2×3 grid, 12 px gap. Settles as a left-to-right, top-to-bottom wave. */
export function WordBoard({ words }: { words: readonly WordCardProps[] }) {
  const announcement = useSaidAnnouncement(words);
  return (
    <div className="grid w-full grid-cols-2 gap-3">
      {words.map((card, index) => (
        <SettleDelayContext key={card.word} value={index * SETTLE_STAGGER}>
          <WordCard {...card} />
        </SettleDelayContext>
      ))}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

/** Screen readers hear "PRESSURE was said" when a card flips, not on the first render. */
function useSaidAnnouncement(words: readonly WordCardProps[]): string {
  const [message, setMessage] = useState("");
  const previous = useRef(new Map(words.map((card) => [card.word, card.state])));
  useEffect(() => {
    const flipped = words.filter(
      (card) => card.state === "said" && previous.current.get(card.word) !== "said",
    );
    previous.current = new Map(words.map((card) => [card.word, card.state]));
    if (flipped.length > 0) setMessage(`${flipped.map((card) => card.word).join(", ")} was said`);
  }, [words]);
  return message;
}
