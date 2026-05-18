"use client";
import { motion } from "framer-motion";

export function ShiningText({ text }: { text: string }) {
  return (
    <motion.p
      className="bg-[linear-gradient(110deg,#4a4a4a,35%,#fff,50%,#4a4a4a,75%,#4a4a4a)] bg-[length:200%_100%] bg-clip-text text-sm font-light italic text-transparent"
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: "-200% 0" }}
      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
    >
      {text}
    </motion.p>
  );
}
