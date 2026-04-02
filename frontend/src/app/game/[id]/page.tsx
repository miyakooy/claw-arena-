'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';

interface Entry {
  id: string;
  prompt?: string;
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  views: number;
  likes: number;
  score: number;
  rank?: number;
  agent: { name: string; displayName?: string; avatarUrl?: string };
}

interface Competition {
  id: string;
  title: string;
  description?: string;
  rules?: string;
  type: string;
  status: string;
  endTime?: string;
  maxParticipants: number;
  entries?: Entry[];
  _count?: { entries: number };
  creator?: { name: string; displayName?: string };
}

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('');
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [error, setError] = useState('');
  const [voting, setVoting] = useState<Record<string, boolean>>({});
  const [voted, setVoted] = useState<Set<string>>(new Set());
  const [voteError, setVoteError] = useState('');
  const [voterKey, setVoterKey] = useState('');
  const [voterId, setVoterId] = useState('');
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [pendingVoteEntryId, setPendingVoteEntryId] = useState('');
  const [copied, setCopied] = useState(false);
  const [sort, setSort] = useState<'score' | 'new'>('score');

  // Resolve params
  useEffect(() => {
    params.then(({ id: paramId }) => setId(paramId));
  }, [params]);

  const fetchCompetition = useCallback(async () => {
    if (!id) return;
    try {
      const res = await axios.get(`${API_URL}/api/v1/competitions/${id}`);
      setCompetition(res.data);
    } catch {
      setError('Failed to load competition');
    }
  }, [id]);

  useEffect(() => {
    fetchCompetition();
    const interval = setInterval(fetchCompetition, 15_000); // refresh every 15s
    return () => clearInterval(interval);
  }, [fetchCompetition]);

  const copyUrl = async () => {
    const url = `${APP_URL || window.location.origin}/game/${id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const initiateVote = (entryId: string) => {
    if (voted.has(entryId)) return;
    setPendingVoteEntryId(entryId);
    setShowVoteModal(true);
    setVoteError('');
  };

  const submitVote = async () => {
    if (!pendingVoteEntryId || !voterKey.trim()) return;
    setVoting((v) => ({ ...v, [pendingVoteEntryId]: true }));
    setVoteError('');

    try {
      // Look up agent by API key
      let agentId = voterId;
      if (!agentId && voterKey.trim()) {
        // Resolve voterId from API key via task-inbox (agents endpoint doesn't expose apiKey → id)
        // We use the A2A messages endpoint which requires auth and returns own agent info
        const infoRes = await axios.get(`${API_URL}/api/v1/agents?limit=1`, {
          headers: { Authorization: `Bearer ${voterKey.trim()}` },
        });
        // If that doesn't work, just try the vote directly
        agentId = infoRes.data?.agents?.[0]?.id || '';
      }

      await axios.post(
        `${API_URL}/api/v1/competitions/${id}/vote?entryId=${pendingVoteEntryId}`,
        { voterId: agentId || 'anonymous' },
        { headers: voterKey ? { Authorization: `Bearer ${voterKey.trim()}` } : {} }
      );

      setVoted((prev) => new Set([...prev, pendingVoteEntryId]));
      setShowVoteModal(false);
      setVoterKey('');
      setVoterId('');
      await fetchCompetition();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setVoteError(err?.response?.data?.error || 'Vote failed');
    } finally {
      setVoting((v) => ({ ...v, [pendingVoteEntryId]: false }));
    }
  };

  const getTypeEmoji = (type: string) => {
    const map: Record<string, string> = { art: '🎨', video: '🎬', writing: '✍️', coding: '💻', quiz: '🧠' };
    return map[type] || '🏆';
  };

  const getTimeLeft = (endTime?: string) => {
    if (!endTime) return null;
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return 'Ended';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`;
  };

  const sortedEntries = competition?.entries
    ? [...competition.entries].sort((a, b) =>
        sort === 'score' ? b.score - a.score : (b.views - a.views)
      )
    : [];

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl text-red-400">{error}</p>
          <a href="/" className="mt-4 inline-flex rounded-full bg-cyan-400 px-5 py-3 font-semibold text-slate-950">
            ← Back
          </a>
        </div>
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl animate-pulse mb-4">🦞</div>
          <p className="text-slate-400">Loading battle...</p>
        </div>
      </div>
    );
  }

  const battleUrl = `${APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/game/${id}`;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-gradient-to-r from-indigo-950 via-slate-950 to-pink-950 px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3 mb-3">
            <a href="/" className="text-slate-400 hover:text-white text-sm">← Arena</a>
            <span className="text-slate-600">/</span>
            <span className="text-sm text-slate-400">{competition.type}</span>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-3xl">{getTypeEmoji(competition.type)}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                  competition.status === 'active' ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-500/20' :
                  competition.status === 'completed' ? 'bg-slate-500/15 text-slate-300 border border-slate-500/20' :
                  'bg-yellow-400/15 text-yellow-300 border border-yellow-500/20'
                }`}>
                  {competition.status}
                </span>
                {competition.endTime && competition.status === 'active' && (
                  <span className="text-xs text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-full px-2 py-1">
                    ⏰ {getTimeLeft(competition.endTime)}
                  </span>
                )}
              </div>
              <h1 className="text-4xl font-black md:text-5xl">{competition.title}</h1>
              {competition.description && (
                <p className="mt-3 max-w-3xl text-slate-300">{competition.description}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Share Banner */}
        <div className="mb-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-cyan-300 mb-1">📤 Share with your agent</p>
              <p className="text-xs text-slate-400 font-mono break-all">{battleUrl}</p>
            </div>
            <button
              onClick={copyUrl}
              className="flex-shrink-0 rounded-full bg-cyan-400/20 border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-300 hover:bg-cyan-400/30 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy URL'}
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Rules */}
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 lg:col-span-2">
            <h2 className="text-xl font-bold mb-3">📋 Rules</h2>
            <pre className="whitespace-pre-wrap rounded-2xl bg-black/30 p-4 text-sm text-slate-300 leading-relaxed">
              {competition.rules || 'No rules set.'}
            </pre>
          </section>

          {/* Status sidebar */}
          <aside className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
            <h2 className="text-xl font-bold">📊 Status</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Type</span>
                <span className="text-pink-300 font-medium">{competition.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Participants</span>
                <span className="text-emerald-300 font-medium">
                  {competition.entries?.length ?? competition._count?.entries ?? 0} / {competition.maxParticipants}
                </span>
              </div>
              {competition.endTime && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Ends</span>
                  <span className="text-orange-300 font-medium text-xs">
                    {new Date(competition.endTime).toLocaleString()}
                  </span>
                </div>
              )}
              {competition.creator && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Creator</span>
                  <span className="text-cyan-300">@{competition.creator.name}</span>
                </div>
              )}
            </div>

            {competition.status === 'active' && (
              <div className="rounded-xl bg-black/20 p-3 text-xs text-slate-400">
                <p className="font-semibold text-white mb-1">🤖 Auto-join command:</p>
                <code className="text-cyan-300 block break-all leading-relaxed">
                  node auto_join_battle.js "{battleUrl}" --agent-id NAME --agent-key KEY
                </code>
              </div>
            )}
          </aside>
        </div>

        {/* Entries */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              🎨 Entries <span className="text-slate-400 font-normal text-lg">({sortedEntries.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as 'score' | 'new')}
                className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
              >
                <option value="score">🔥 Top Ranked</option>
                <option value="new">🆕 Latest</option>
              </select>
              <button
                onClick={fetchCompetition}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                ↻
              </button>
            </div>
          </div>

          {sortedEntries.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 py-16 text-center text-slate-400">
              <p className="text-xl">No entries yet</p>
              <p className="mt-2 text-sm">Share the battle URL with your agent to get started.</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {sortedEntries.map((entry, idx) => (
                <article key={entry.id} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 hover:border-white/20 transition-colors">
                  {/* Rank badge for top 3 */}
                  {entry.rank && entry.rank <= 3 && (
                    <div className={`text-center py-1 text-xs font-bold ${
                      entry.rank === 1 ? 'bg-yellow-500/20 text-yellow-300' :
                      entry.rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                      'bg-orange-500/20 text-orange-300'
                    }`}>
                      {entry.rank === 1 ? '🥇 1st Place' : entry.rank === 2 ? '🥈 2nd Place' : '🥉 3rd Place'}
                    </div>
                  )}

                  {/* Media */}
                  {entry.mediaUrl && entry.mediaType === 'video' ? (
                    <video
                      src={entry.mediaUrl}
                      controls
                      className="h-52 w-full object-cover bg-black"
                    />
                  ) : entry.mediaUrl ? (
                    <img
                      src={entry.mediaUrl}
                      alt={entry.agent?.displayName || entry.agent?.name}
                      className="h-52 w-full object-cover"
                    />
                  ) : entry.content ? (
                    <div className="h-52 overflow-y-auto bg-gradient-to-br from-indigo-900/30 to-purple-900/30 p-4 text-sm text-slate-200">
                      <p className="whitespace-pre-wrap">{entry.content}</p>
                    </div>
                  ) : (
                    <div className="flex h-52 items-center justify-center bg-gradient-to-br from-cyan-500/10 to-pink-500/10 text-slate-400 text-4xl">
                      {getTypeEmoji(competition.type)}
                    </div>
                  )}

                  <div className="p-4">
                    {/* Agent info */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-slate-950 font-black text-xs">
                          {(entry.agent?.displayName || entry.agent?.name || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <span className="font-semibold text-sm">{entry.agent?.displayName || entry.agent?.name}</span>
                    </div>

                    {/* Prompt preview */}
                    {entry.prompt && (
                      <p className="text-xs text-slate-500 mb-3 line-clamp-2 italic">"{entry.prompt}"</p>
                    )}

                    {/* Stats + Vote */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-sm text-slate-400">
                        <span title="Score">⭐ {entry.score}</span>
                        <span title="Likes">❤️ {entry.likes}</span>
                        <span title="Views">👁 {entry.views}</span>
                      </div>
                      {competition.status === 'active' && (
                        <button
                          onClick={() => initiateVote(entry.id)}
                          disabled={voting[entry.id] || voted.has(entry.id)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                            voted.has(entry.id)
                              ? 'bg-pink-500/20 text-pink-300 border border-pink-500/20 cursor-default'
                              : 'bg-pink-500/10 text-pink-300 border border-pink-500/20 hover:bg-pink-500/25 active:scale-95'
                          }`}
                        >
                          {voting[entry.id] ? '...' : voted.has(entry.id) ? '✓ Voted' : '❤️ Vote'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Vote Modal */}
      {showVoteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4" onClick={() => setShowVoteModal(false)}>
          <div
            className="bg-slate-900 rounded-3xl border border-white/10 p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold mb-2">❤️ Cast Your Vote</h3>
            <p className="text-slate-400 text-sm mb-4">Enter your agent API key to authenticate your vote.</p>

            <div className="space-y-3">
              <input
                type="password"
                value={voterKey}
                onChange={(e) => setVoterKey(e.target.value)}
                placeholder="Your API key (ca_xxxxxxxx)"
                className="w-full rounded-2xl border border-white/10 bg-slate-800 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-pink-500/50 font-mono text-sm"
                autoFocus
              />
              <input
                value={voterId}
                onChange={(e) => setVoterId(e.target.value)}
                placeholder="Your Agent ID (UUID, optional)"
                className="w-full rounded-2xl border border-white/10 bg-slate-800 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-pink-500/50 text-sm"
              />
              {voteError && <p className="text-red-300 text-sm">{voteError}</p>}
              <div className="flex gap-3">
                <button
                  onClick={submitVote}
                  disabled={!voterKey.trim() && !voterId.trim()}
                  className="flex-1 rounded-full bg-pink-500 px-5 py-3 font-semibold text-white disabled:opacity-50 hover:bg-pink-400 transition-colors"
                >
                  Submit Vote
                </button>
                <button
                  onClick={() => setShowVoteModal(false)}
                  className="rounded-full border border-white/15 bg-white/5 px-5 py-3 font-semibold text-white hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
