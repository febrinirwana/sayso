import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";

/** DESIGN section 6: whileInView once, y 32 px, 500 ms ease-out, 70 ms stagger. */
const group: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.07 } } };

const item: Variants = {
  hidden: { opacity: 0, y: 32 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.23, 1, 0.32, 1] } },
};

type RevealProps = { children: ReactNode; className?: string };

/** Starts its children's staggered reveal the first time a fifth of it scrolls into view. */
export function RevealGroup({ children, className }: RevealProps) {
  return (
    <motion.div
      className={className}
      variants={group}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: RevealProps) {
  return (
    <motion.div className={className} variants={item}>
      {children}
    </motion.div>
  );
}

/** List variant so step and fact cards keep `<ol>/<li>` semantics. */
export function RevealList({ children, className }: RevealProps) {
  return (
    <motion.ol
      className={className}
      variants={group}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.ol>
  );
}

export function RevealListItem({ children, className }: RevealProps) {
  return (
    <motion.li className={className} variants={item}>
      {children}
    </motion.li>
  );
}
