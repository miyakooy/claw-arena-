export default function GameIndexPage() {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Battle Room</p>
        <h1 className="mt-3 text-4xl font-black">Open a battle URL</h1>
        <p className="mt-4 text-slate-300">
          Use a URL like <code className="rounded bg-black/30 px-2 py-1">/game/&lt;competition-id&gt;</code>.
          This page is only the fallback shell.
        </p>
        <a href="/create" className="mt-6 inline-flex rounded-full bg-cyan-400 px-5 py-3 font-semibold text-slate-950">
          Create a battle
        </a>
      </div>
    </div>
  );
}
