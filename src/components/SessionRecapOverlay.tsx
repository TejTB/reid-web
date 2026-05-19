"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

type RecapResponse = {
  title?: string;
  summary?: string;
  commitments?: string[];
  reid_note?: string;
};

type Props = {
  sessionId: string;
  onClose?: () => void;
};

const STAGGER_MS = 150;
const CTA_DELAY_MS = 2000;

export function SessionRecapOverlay({ sessionId, onClose }: Props) {
  const router = useRouter();
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [error, setError] = useState(false);
  const [showCta, setShowCta] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/session-recap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!res.ok) {
          if (!cancelled) setError(true);
          return;
        }
        const body = (await res.json()) as RecapResponse;
        if (!cancelled) setRecap(body);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const id = window.setTimeout(() => setShowCta(true), CTA_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  function handleBack() {
    onClose?.();
    router.push("/home");
  }

  const ready = !!recap || error;

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Session recap"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-6"
      style={{
        background: "#060E1C",
      }}
    >
      <div
        className="w-full"
        style={{ maxWidth: 560 }}
      >
        <AnimatePresence>
          {!ready && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="font-serif italic text-center"
              style={{
                color: "#7A90A8",
                fontSize: 18,
              }}
            >
              Reid&apos;s writing it down…
            </motion.div>
          )}
        </AnimatePresence>

        {ready && (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{
              show: {
                transition: {
                  staggerChildren: STAGGER_MS / 1000,
                  delayChildren: 0.1,
                },
              },
            }}
            className="flex flex-col items-center text-center"
            style={{ gap: 20 }}
          >
            {error ? (
              <motion.p
                variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                className="font-serif italic"
                style={{ color: "#F2EDE3", fontSize: 22 }}
              >
                My end is jammed.
              </motion.p>
            ) : (
              <>
                {recap?.title && (
                  <motion.h2
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      show: { opacity: 1, y: 0 },
                    }}
                    className="font-serif italic"
                    style={{
                      color: "#F2EDE3",
                      fontSize: 28,
                      lineHeight: 1.25,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {recap.title}
                  </motion.h2>
                )}
                {recap?.summary && (
                  <motion.p
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      show: { opacity: 1, y: 0 },
                    }}
                    className="font-sans"
                    style={{
                      color: "#C8D5E3",
                      fontSize: 16,
                      lineHeight: 1.6,
                    }}
                  >
                    {recap.summary}
                  </motion.p>
                )}
                {recap?.commitments && recap.commitments.length > 0 && (
                  <motion.ul
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      show: { opacity: 1, y: 0 },
                    }}
                    className="font-serif italic flex flex-col"
                    style={{
                      color: "#F2EDE3",
                      fontSize: 16,
                      gap: 10,
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      alignItems: "flex-start",
                      textAlign: "left",
                    }}
                  >
                    {recap.commitments.map((c, i) => (
                      <li
                        key={i}
                        className="flex items-baseline"
                        style={{ gap: 10 }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: "#B91C1C",
                            display: "inline-block",
                            flexShrink: 0,
                            position: "relative",
                            top: -2,
                          }}
                        />
                        <span>{c}</span>
                      </li>
                    ))}
                  </motion.ul>
                )}
                {recap?.reid_note && (
                  <motion.p
                    variants={{
                      hidden: { opacity: 0, y: 8 },
                      show: { opacity: 1, y: 0 },
                    }}
                    className="font-serif italic"
                    style={{
                      color: "#7A90A8",
                      fontSize: 14,
                      lineHeight: 1.6,
                      maxWidth: 420,
                    }}
                  >
                    {recap.reid_note}
                  </motion.p>
                )}
              </>
            )}

            <motion.button
              type="button"
              onClick={handleBack}
              animate={{ opacity: showCta ? 1 : 0 }}
              transition={{ duration: 0.4 }}
              className="font-sans"
              style={{
                marginTop: 12,
                background: "#B91C1C",
                color: "#F2EDE3",
                border: "none",
                borderRadius: 10,
                padding: "12px 22px",
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "0.04em",
                cursor: showCta ? "pointer" : "default",
                pointerEvents: showCta ? "auto" : "none",
              }}
            >
              Back to home →
            </motion.button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
