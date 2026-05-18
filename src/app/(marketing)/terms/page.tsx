// Stub Terms of Service surface — referenced from the signup checkbox on
// /login. Working draft; full policy will be published before public launch.
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-3xl text-white mb-1">
          Terms of Service
        </h1>
        <p className="text-white/30 text-sm font-sans mb-12">
          Last updated May 2026
        </p>

        <div className="space-y-8 text-white/55 text-sm font-sans leading-relaxed">
          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              1. About Reid
            </h2>
            <p>
              Reid is an AI co-founder tool. By creating an account or using
              Reid, you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              2. Your account
            </h2>
            <p>
              You are responsible for maintaining the security of your account
              and for all activity that occurs under it. Sessions are tied to
              the email you sign in with — do not share that inbox with anyone
              you do not want reading your conversations with Reid.
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              3. Reid Pro
            </h2>
            <p>
              Reid Pro is a paid subscription billed monthly or annually.
              Payments are processed by Stripe; we do not store card details.
              You may cancel at any time from Settings — your access continues
              until the end of the paid period.
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              4. What Reid is, and is not
            </h2>
            <p>
              Reid provides reflection, structure, and direct guidance based on
              what you tell him. He is not a substitute for professional
              business, legal, financial, medical, or mental-health advice. Do
              not rely on Reid for decisions where qualified human counsel is
              required.
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              5. Acceptable use
            </h2>
            <p>
              Do not use Reid to attempt to extract another user&apos;s data,
              to generate content that violates applicable law, or to abuse the
              service in ways that degrade it for other users. We may suspend
              accounts that do.
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              6. Contact
            </h2>
            <p>
              Questions about these terms? Email{" "}
              <a
                href="mailto:hello@reid.ai"
                className="text-white/70 hover:text-white underline transition-colors"
              >
                hello@reid.ai
              </a>
              .
            </p>
          </section>

          <p className="text-white/25 text-xs pt-8 border-t border-white/6 font-sans">
            Working draft. Full terms will be published before public launch.
          </p>
        </div>
      </div>
    </div>
  );
}
