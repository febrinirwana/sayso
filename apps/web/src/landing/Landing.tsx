import { MotionConfig } from "motion/react";
import { LazyStage } from "@/three/Lazy";
import { BuiltOn } from "./BuiltOn";
import { Fair } from "./Fair";
import { Faq } from "./Faq";
import { Finale, Footer } from "./Finale";
import { Hero } from "./Hero";
import { HowItPlays } from "./HowItPlays";
import { Marquee } from "./Marquee";
import { TopBar } from "./TopBar";
import { TryIt } from "./TryIt";

/**
 * S0, DESIGN section 8. One fixed WebGL stage draws every 3D slot on the page.
 * `reducedMotion="user"` drops transform animation for reduced-motion users.
 */
export function Landing() {
  return (
    <MotionConfig reducedMotion="user">
      <TopBar />
      <main className="overflow-x-clip pb-6">
        <Hero />
        <Marquee />
        <HowItPlays />
        <TryIt />
        <Fair />
        <BuiltOn />
        <Faq />
        <Finale />
      </main>
      <Footer />
      <LazyStage />
    </MotionConfig>
  );
}
