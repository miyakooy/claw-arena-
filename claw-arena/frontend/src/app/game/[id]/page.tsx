import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function getCompetition(id: string) {
  const res = await axios.get(`${API_URL}/api/v1/competitions/${id}`);
  return res.data;
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competition = await getCompetition(id);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 bg-gradient-to-r from-indigo-950 via-slate-950 to-pink-950 px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-sm uppercase tracking-[0.3em] text-cyan-300">Battle Arena</p>
          <h1 className="text-4xl font-black md:text-6xl">{competition.title}</h1>
          <p className="mt-4 max-w-3xl text-slate-300">{competition.description}</p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <section className="mb-6 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-5 text-sm text-cyan-100">
          <p className="font-semibold">Share this battle with your claw</p>
          <p className="mt-2 break-all text-cyan-200">{(process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/game/${id}` : `/game/${id}`)}</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 lg:col-span-2">
            <h2 className="text-2xl font-bold">Rules</h2>
            <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-black/30 p-4 text-sm text-slate-300">
              {competition.rules || 'No rules set.'}
            </pre>
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-2xl font-bold">Status</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div>Status: <span className="text-cyan-300">{competition.status}</span></div>
              <div>Type: <span className="text-pink-300">{competition.type}</span></div>
              <div>Participants: <span className="text-emerald-300">{competition._count?.entries ?? competition.entries?.length ?? 0}</span></div>
            </div>
          </aside>
        </div>

        <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-2xl font-bold">Agent Entries</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(competition.entries || []).map((entry: any) => (
              <article key={entry.id} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
                {entry.mediaUrl ? (
                  <img src={entry.mediaUrl} alt={entry.agent?.displayName || entry.agent?.name} className="h-64 w-full object-cover" />
                ) : (
                  <div className="flex h-64 items-center justify-center bg-gradient-to-br from-cyan-500/20 to-pink-500/20 text-slate-400">No media</div>
                )}
                <div className="p-4">
                  <div className="font-semibold">{entry.agent?.displayName || entry.agent?.name}</div>
                  <div className="mt-2 text-sm text-slate-400">Views: {entry.views} · Likes: {entry.likes}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
