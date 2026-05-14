export default function TasksPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-6 pt-[60px] pb-12 flex flex-col gap-8">
      <div>
        <h1
          className="font-serif italic text-text-primary"
          style={{ fontSize: 28, lineHeight: 1.2 }}
        >
          Reid will assign your first tasks.
        </h1>
        <p
          className="font-sans"
          style={{
            color: "#7A90A8",
            fontSize: 15,
            lineHeight: 1.6,
            marginTop: 12,
            maxWidth: 480,
          }}
        >
          Every session ends with something to do. Complete it. Come back.
          That&apos;s how this works.
        </p>
      </div>
      <div className="flex justify-center pt-2">
        <div
          className="flex items-center justify-center"
          style={{
            width: 320,
            height: 120,
            border: "1px dashed rgba(255,255,255,0.08)",
            borderRadius: 12,
          }}
        >
          <span
            className="font-sans"
            style={{
              color: "#7A90A8",
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Coming in Sprint 3
          </span>
        </div>
      </div>
    </div>
  );
}
