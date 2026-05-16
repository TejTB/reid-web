import Link from "next/link";
import LogoMark from "@/components/LogoMark";

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen bg-bg-dark flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center" style={{ gap: 24 }}>
        <LogoMark size={48} />
        <h1
          className="font-serif text-text-primary text-center"
          style={{
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          We couldn&apos;t sign you in.
        </h1>
        <p
          className="font-sans text-center"
          style={{ fontSize: 14, color: "#7A90A8", lineHeight: 1.6, maxWidth: 360 }}
        >
          The link may have expired or already been used. Try again from this
          device.
        </p>
        <Link
          href="/login"
          className="cta-shadow flex items-center justify-center font-sans text-text-primary"
          style={{
            height: 46,
            padding: "0 28px",
            borderRadius: 9,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.04em",
            background: "#B91C1C",
            textDecoration: "none",
          }}
        >
          Try again
        </Link>
      </div>
    </div>
  );
}
