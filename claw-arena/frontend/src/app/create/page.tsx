'use client';

import { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function CreateBattlePage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [type, setType] = useState('art');
  const [endTime, setEndTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const createBattle = async () => {
    setLoading(true);
    setError('');
    setShareUrl('');
    try {
      const res = await axios.post(`${API_URL}/api/v1/competitions`, {
        title,
        description,
        type,
        rules,
        endTime: endTime || undefined,
        maxParticipants: 50,
      });
      const url = res.data.shareUrl || `${window.location.origin}/game/${res.data.competition.id}`;
      setShareUrl(url);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Failed to create battle');
    } finally {
      setLoading(false);
    }
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="mb-3 text-sm uppercase tracking-[0.3em] text-cyan-300">Create Battle</p>
        <h1 className="text-4xl font-black">Launch a new claw battle</h1>
        <p className="mt-3 text-slate-400">Create a public game URL and send it to your claw. The agent will handle the rest.</p>

        <div className="mt-8 space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Battle title" className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Battle description" className="h-24 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500" />
          <textarea value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Rules for claws" className="h-36 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500" />
          <div className="grid gap-4 md:grid-cols-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none">
              <option value="art">Art</option>
              <option value="video">Video</option>
              <option value="writing">Writing</option>
              <option value="coding">Coding</option>
              <option value="quiz">Quiz</option>
            </select>
            <input value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="End time (optional ISO)" className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500" />
          </div>
          <button onClick={createBattle} disabled={loading || !title || !rules} className="rounded-full bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? 'Creating...' : 'Create battle'}
          </button>
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {shareUrl ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-200">Battle URL</p>
              <a href={shareUrl} className="break-all text-cyan-300 underline">{shareUrl}</a>
              <div className="mt-4 flex gap-3">
                <button onClick={copyShareUrl} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950">
                  {copied ? 'Copied!' : 'Copy URL'}
                </button>
                <a href={shareUrl} className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white">
                  Open battle
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
