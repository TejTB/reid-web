// Stub Privacy Policy surface — referenced from the signup checkbox on
// /login. Working draft; full policy will be published before public launch.
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-serif text-3xl text-white mb-1">
          Privacy Policy
        </h1>
        <p className="text-white/30 text-sm font-sans mb-12">
          Last updated May 2026
        </p>

        <div className="space-y-8 text-white/55 text-sm font-sans leading-relaxed">
          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              1. What we collect
            </h2>
            <p>
              The email you sign in with, the conversations you have with Reid,
              the goals and tasks you create, and the observations Reid makes
              between sessions. We also store basic billing metadata returned
              by Stripe (subscription status, plan interval) — never your card
              details.
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              2. Where it lives
            </h2>
            <p>
              Your data is stored in Supabase (Postgres + storage) on
              EU-region infrastructure. Row-level security ensures each user
              can only read their own rows. Reid himself runs on Anthropic
              models; conversation content is sent to Anthropic per request and
              is not used to train their models.
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              3. What we do not do
            </h2>
            <p>
              We do not sell your data. We do not share your conversations with
              advertisers, brokers, or other users. We do not read your
              sessions for any purpose other than operating the service and
              responding to direct support requests you initiate.
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              4. Your rights
            </h2>
            <p>
              You can request a copy of your data, export your sessions, or
              delete your account entirely at any time. Under UK GDPR you have
              the right of access, rectification, erasure, and portability — to
              exercise any of these, email{" "}
              <a
                href="mailto:privacy@reid.ai"
                className="text-white/70 hover:text-white underline transition-colors"
              >
                privacy@reid.ai
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              5. Retention
            </h2>
            <p>
              Active accounts keep their data indefinitely so Reid can remember
              context across sessions. When you delete your account, your rows
              are removed from our database within 30 days; backups roll off on
              a 90-day cycle.
            </p>
          </section>

          <section>
            <h2 className="text-white/80 font-medium mb-2 font-sans">
              6. Contact
            </h2>
            <p>
              Privacy questions? Email{" "}
              <a
                href="mailto:privacy@reid.ai"
                className="text-white/70 hover:text-white underline transition-colors"
              >
                privacy@reid.ai
              </a>
              .
            </p>
          </section>

          <p className="text-white/25 text-xs pt-8 border-t border-white/6 font-sans">
            Working draft. Full policy will be published before public launch.
          </p>
        </div>
      </div>
    </div>
  );
}
