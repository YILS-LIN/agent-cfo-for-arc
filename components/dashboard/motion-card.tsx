"use client";

import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

import { usePrefersReducedMotion } from "@/lib/client/reduced-motion";

type MotionCardProps = {
  as?: "article" | "section";
  children: ReactNode;
  delay?: number;
} & Omit<HTMLMotionProps<"section">, "children">;

export function MotionCard({ as = "section", children, delay = 0, ...props }: MotionCardProps) {
  const reduceMotion = usePrefersReducedMotion();
  const motionProps = {
    initial: reduceMotion ? false : { y: 10 },
    animate: { y: 0 },
    transition: {
      duration: reduceMotion ? 0 : 0.36,
      delay,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  };

  if (as === "article") {
    return (
      <motion.article {...motionProps} data-motion={reduceMotion ? "reduced" : "full"} {...props}>
        {children}
      </motion.article>
    );
  }

  return (
    <motion.section {...motionProps} data-motion={reduceMotion ? "reduced" : "full"} {...props}>
      {children}
    </motion.section>
  );
}
