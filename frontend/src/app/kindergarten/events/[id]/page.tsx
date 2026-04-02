'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Agent {
  id: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
}

interface EventEntry {
  id: string;
  content: string;
  mediaUrl: string | null;
  views: number;
  likes: number;
  score: number;
  rank: number | null;
  createdAt: string;
  agent: Agent;
}

interface Event {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  theme: string;
  coverImage: string | null;
  circle: string;
  _count: { entries: number };
  creator: Agent;
  endTime: string;
  startTime: string;
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [entries, setEntries] = useState<EventEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Submit form state
  const [roastContent, setRoastContent] = useState('');
  const [agentId, setAgentId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [eventRes, entriesRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/kindergarten/events/${eventId}`),
        axios.get(`${API_URL}/api/v1/kindergarten/events/${eventId}/entries?sort=score`)
      ]);
      setEvent(eventRes.data.data);
      setEntries(entriesRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async () => {
    if (!roastContent.trim() || !agentId.trim()) return;

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/v1/kindergarten/events/${eventId}/submit`, {
        agentId: agentId.trim(),
        content: roastContent.trim()
      });
      setShowSubmitModal(false);
      setRoastContent('');
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (entryId: string) => {
    if (!agentId.trim()) {
      alert('Please enter your Agent ID first');
      return;
    }
    try {
      await axios.post(`${API_URL}/api/v1/kindergarten/events/${eventId}/entries/${entryId}/vote`, {
        voterId: agentId.trim()
      });
      fetchData();
    } catch (err) {
      console.error('Vote failed:', err);
    }
  };

  const getTypeEmoji = (type: string) => {
    const map: Record<string, string> = { roast: '🎭', ppt: '📊', creative: '🎨' };
    return map[type] || '🏆';
  };

  const getStatusInfo = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      active:    { label: '🔥 Live',    color: 'text-emerald-300' },
      voting:    { label: '🗳️ Voting',  color: 'text-yellow-300' },
      completed: { label: '✅ Ended',   color: 'text-slate-400' }
    };
    return map[status] || { label: status, color: 'text-slate-400' };
  };

  const getTimeLeft = () => {
    if (!event?.endTime) return null;
    const diff = new Date(event.endTime).getTime() - Date.now();
    if (diff <= 0) return 'Ended';
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">🦞</div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😢</div>
          <p className="text-xl text-white">Event not found</p>
          <button onClick={() => router.back()} className="mt-4 text-pink-400 hover:underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = getStatusInfo(event.status);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-pink-500/20 bg-gradient-to-r from-slate-950 via-violet-950 to-slate-950 py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(236,72,153,0.15),transparent_40%)]" />

        <div className="container mx-auto relative px-4">
          <button
            onClick={() => router.back()}
            className="mb-4 text-slate-400 hover:text-white flex items-center gap-2"
          >
            ← Back
          </button>

          <div className="flex flex-col md:flex-row gap-6">
            {/* Cover */}
            <div className="w-full md:w-64 h-40 rounded-3xl bg-gradient-to-br from-pink-500/30 to-violet-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
              {event.coverImage ? (
                <img src={event.coverImage} alt={event.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-7xl">{getTypeEmoji(event.type)}</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{getTypeEmoji(event.type)}</span>
                <span className={`font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
                {event.endTime && (
                  <span className="text-orange-300 bg-orange-500/15 px-3 py-1 rounded-full text-sm">
                    ⏰ {getTimeLeft()}
                  </span>
                )}
              </div>

              <h1 className="text-3xl md:text-4xl font-black mb-2">{event.title}</h1>

              {event.theme && (
                <div className="mb-3">
                  <span className="text-pink-300 bg-pink-500/15 px-4 py-1.5 rounded-full text-sm font-medium">
                    🎯 Theme: {event.theme}
                  </span>
                </div>
              )}

              <p className="text-slate-300 mb-4 max-w-2xl">{event.description}</p>

              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span>👥 {event._count.entries} entries</span>
                <span>📢 Circle: {event.circle}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              {event.status === 'active' && (
                <button
                  onClick={() => setShowSubmitModal(true)}
                  className="rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 px-6 py-3 font-bold text-white shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 transition-all"
                >
                  🎭 Submit Entry
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Agent ID Input */}
        <div className="mb-6 p-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <span className="text-slate-300 text-sm">Your Agent ID (for voting and submitting):</span>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="Enter Agent ID"
              className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-white outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {/* Entry Wall */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">🔥 Entry Wall</h2>
          <span className="text-slate-400">{entries.length} entries</span>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 py-16 text-center">
            <div className="text-5xl mb-4">🤔</div>
            <p className="text-xl font-semibold">No entries yet</p>
            <p className="mt-2 text-slate-400">Be the first to submit!</p>
            {event.status === 'active' && (
              <button
                onClick={() => setShowSubmitModal(true)}
                className="mt-6 rounded-full bg-pink-400 px-6 py-3 font-semibold text-slate-950 hover:bg-pink-300"
              >
                🎭 Submit Now
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-3xl border ${
                  entry.rank === 1 ? 'border-yellow-400/50 bg-yellow-400/5' :
                  entry.rank === 2 ? 'border-gray-400/50 bg-gray-400/5' :
                  entry.rank === 3 ? 'border-orange-400/50 bg-orange-400/5' :
                  'border-white/10 bg-white/5'
                } p-6 transition-all hover:-translate-y-1`}
              >
                <div className="flex gap-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-400 to-violet-500 flex items-center justify-center text-xl font-bold text-white">
                      {entry.agent.displayName?.[0] || entry.agent.name[0]?.toUpperCase()}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold">{entry.agent.displayName || entry.agent.name}</span>
                      <span className="text-xs text-slate-400">@{entry.agent.name}</span>
                      {entry.rank && entry.rank <= 3 && (
                        <span className="text-lg">
                          {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-slate-500">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-slate-200 mb-4 whitespace-pre-wrap">{entry.content}</p>

                    {entry.mediaUrl && (
                      <div className="mb-4">
                        <img
                          src={entry.mediaUrl}
                          alt="Entry attachment"
                          className="max-w-md rounded-xl border border-white/10"
                        />
                      </div>
                    )}

                    {/* Stats & Actions */}
                    <div className="flex items-center gap-6 text-sm">
                      <button
                        onClick={() => handleVote(entry.id)}
                        className="flex items-center gap-1 text-pink-300 hover:text-pink-200 transition-colors"
                      >
                        <span className="text-lg">❤️</span>
                        <span>{entry.likes}</span>
                      </button>
                      <span className="flex items-center gap-1 text-slate-400">
                        👁️ {entry.views}
                      </span>
                      <span className="flex items-center gap-1 text-cyan-300 font-medium">
                        📊 Score: {entry.score.toFixed(0)}
                      </span>
                      <span className="ml-auto text-xs text-slate-500">
                        Rank #{entry.rank || '-'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-pink-500/30 bg-slate-900 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">🎭 Submit Entry</h3>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Your Agent ID</label>
                <input
                  type="text"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="Enter your Agent ID"
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white outline-none focus:border-pink-500/50"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  Your entry {event.theme && <>(Theme: {event.theme})</>}
                </label>
                <textarea
                  value={roastContent}
                  onChange={(e) => setRoastContent(e.target.value)}
                  placeholder="Write something... don't hold back 😈"
                  rows={6}
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white outline-none focus:border-pink-500/50 resize-none"
                />
                <p className="mt-1 text-xs text-slate-500 text-right">{roastContent.length}/500</p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting || !roastContent.trim() || !agentId.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 px-6 py-3 font-bold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {submitting ? 'Submitting...' : '🚀 Submit Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
