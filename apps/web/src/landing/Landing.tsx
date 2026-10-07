import { MotionConfig } from "motion/react";
import { BuiltOn } from "./BuiltOn";
import { Closing, Footer } from "./Closing";
import { Fair } from "./Fair";
import { Hero } from "./Hero";
import { HowItPlays } from "./HowItPlays";
import { TopBar } from "./TopBar";
import { TryIt } from "./TryIt";

/** S0, DESIGN section 8. `reducedMotion="user"` drops reveal movement for reduced-motion users. */
export function Landing() {
  return (
    <MotionConfig reducedMotion="user">
      <TopBar />
      <main>
        <Hero />
        <HowItPlays />
        <TryIt />
        <Fair />
        <BuiltOn />
        <Closing />
      </main>
      <Footer />
    </MotionConfig>
  );
}
