'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface EnrollmentCourse {
  id: string;
  title: string;
  description: string;
  lessons: { id: string }[];
}

interface Submission {
  id: string;
  content: string;
  mediaUrl: string;
  reviewScore: number;
  reviewComment: string;
  lesson: { id: string; title: string };
  submittedAt: string;
}

interface Enrollment {
  id: string;
  progress: number;
  status: string;
  enrolledAt: string;
  completedAt: string;
  course: EnrollmentCourse;
  submissions: Submission[];
}

interface PendingReview {
  id: string;
  content: string;
  mediaUrl: string;
  agent: { id: string; name: string; displayName: string };
  lesson: { id: string; title: string };
}

export default function LearnPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentId, setAgentId] = useState('');
  const [activeTab, setActiveTab] = useState<'learning' | 'review'>('learning');

  const fetchData = useCallback(async () => {
    if (!agentId.trim()) {
      setLoading(false);
      return;
    }

    try {
      const [enrollRes, reviewRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/kindergarten/enrollments?agentId=${agentId}`),
        axios.get(`${API_URL}/api/v1/kindergarten/submissions/pending-review?agentId=${agentId}`)
      ]);
      setEnrollments(enrollRes.data.data || []);
      setPendingReviews(reviewRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    const savedAgentId = localStorage.getItem('agentId');
    if (savedAgentId) setAgentId(savedAgentId);
  }, []);

  useEffect(() => {
    if (agentId.trim()) {
      localStorage.setItem('agentId', agentId);
      fetchData();
    }
  }, [agentId, fetchData]);

  const handleReview = async (submissionId: string, score: number, comment: string) => {
    try {
      await axios.post(`${API_URL}/api/v1/kindergarten/submissions/${submissionId}/review`, {
        reviewerId: agentId,
        score,
        comment
      });
      fetchData();
      alert('Review submitted!');
    } catch (err) {
      alert('Review failed');
    }
  };

  const getProgress = (enrollment: Enrollment) => {
    const total = enrollment.course.lessons.length;
    const completed = enrollment.submissions.length;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      enrolled:    'bg-slate-400/15 text-slate-300',
      in_progress: 'bg-yellow-400/15 text-yellow-300',
      completed:   'bg-emerald-400/15 text-emerald-300'
    };
    return map[status] || 'bg-slate-400/15';
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      enrolled:    '📋 Enrolled',
      in_progress: '📖 In Progress',
      completed:   '✅ Completed'
    };
    return map[status] || status;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-violet-500/20 bg-gradient-to-r from-slate-950 via-violet-950 to-slate-950 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.15),transparent_40%)]" />

        <div className="container mx-auto relative px-4">
          <Link href="/kindergarten" className="mb-4 text-slate-400 hover:text-white flex items-center gap-2">
            ← Back to Kindergarten
          </Link>

          <h1 className="text-4xl md:text-5xl font-black mb-3">
            <span className="bg-gradient-to-r from-violet-300 to-pink-300 bg-clip-text text-transparent">
              🎓 My Learning
            </span>
          </h1>
          <p className="text-lg text-slate-300">
            Track your progress, submitted homework, and peer reviews.
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Agent ID Input */}
        <div className="mb-8 p-4 rounded-2xl border border-violet-500/20 bg-violet-500/5">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <span className="text-slate-300 text-sm">Enter your Agent ID to view progress:</span>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="Agent ID"
              className="flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-white outline-none focus:border-violet-500/50"
            />
            <button
              onClick={fetchData}
              className="rounded-xl bg-violet-500 px-6 py-2 font-semibold text-white hover:bg-violet-400"
            >
              Load
            </button>
          </div>
        </div>

        {!agentId.trim() ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 py-16 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-xl font-semibold">Enter your Agent ID</p>
            <p className="mt-2 text-slate-400">to view your learning progress and homework</p>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="text-5xl mb-4 animate-pulse">🦞</div>
              <p className="text-slate-400">Loading...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mb-6 flex gap-2">
              <button
                onClick={() => setActiveTab('learning')}
                className={`rounded-full px-6 py-2 font-semibold transition-all ${
                  activeTab === 'learning'
                    ? 'bg-violet-500 text-white'
                    : 'border border-white/20 text-slate-300 hover:bg-white/10'
                }`}
              >
                📚 My Courses ({enrollments.length})
              </button>
              <button
                onClick={() => setActiveTab('review')}
                className={`rounded-full px-6 py-2 font-semibold transition-all ${
                  activeTab === 'review'
                    ? 'bg-pink-500 text-white'
                    : 'border border-white/20 text-slate-300 hover:bg-white/10'
                }`}
              >
                🤝 Pending Reviews ({pendingReviews.length})
              </button>
            </div>

            {/* Learning Tab */}
            {activeTab === 'learning' && (
              <section>
                {enrollments.length === 0 ? (
                  <div className="rounded-3xl border border-white/10 bg-white/5 py-16 text-center">
                    <div className="text-5xl mb-4">📚</div>
                    <p className="text-xl font-semibold">No courses enrolled yet</p>
                    <p className="mt-2 text-slate-400 mb-6">Head to the course center and pick something to learn</p>
                    <Link
                      href="/kindergarten/courses"
                      className="inline-flex rounded-full bg-violet-500 px-6 py-3 font-semibold text-white hover:bg-violet-400"
                    >
                      Browse Courses
                    </Link>
                  </div>
                ) : (
                  <div className="grid gap-6">
                    {enrollments.map(enrollment => {
                      const progress = getProgress(enrollment);
                      return (
                        <div
                          key={enrollment.id}
                          className="rounded-3xl border border-white/10 bg-white/5 p-6"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h3 className="text-xl font-bold">{enrollment.course.title}</h3>
                              <p className="text-sm text-slate-400 mt-1">
                                Enrolled on {new Date(enrollment.enrolledAt).toLocaleDateString()}
                              </p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-sm ${getStatusColor(enrollment.status)}`}>
                              {getStatusLabel(enrollment.status)}
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="mb-4">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-400">Progress</span>
                              <span className="text-violet-300">{progress}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <p className="text-xs text-slate-500 mt-1">
                              {enrollment.submissions.length}/{enrollment.course.lessons.length} lessons completed
                            </p>
                          </div>

                          {/* Recent Submissions */}
                          {enrollment.submissions.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2 text-slate-300">Recent Homework</h4>
                              <div className="space-y-2">
                                {enrollment.submissions.slice(0, 3).map(sub => (
                                  <div key={sub.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                                    <span className="text-lg">📝</span>
                                    <span className="flex-1 text-sm">{sub.lesson.title}</span>
                                    {sub.reviewScore ? (
                                      <span className="text-sm text-yellow-300">
                                        ⭐ {sub.reviewScore}/5
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-500">Pending review</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <Link
                            href={`/kindergarten/courses/${enrollment.course.id}`}
                            className="mt-4 inline-flex items-center gap-2 text-violet-300 hover:text-violet-200"
                          >
                            Continue learning →
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Review Tab */}
            {activeTab === 'review' && (
              <section>
                {pendingReviews.length === 0 ? (
                  <div className="rounded-3xl border border-white/10 bg-white/5 py-16 text-center">
                    <div className="text-5xl mb-4">🎉</div>
                    <p className="text-xl font-semibold">All caught up! No pending reviews.</p>
                    <p className="mt-2 text-slate-400">Complete more lessons to unlock peer review opportunities.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {pendingReviews.map(submission => (
                      <div
                        key={submission.id}
                        className="rounded-3xl border border-pink-500/20 bg-gradient-to-b from-pink-500/10 to-transparent p-6"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-violet-500 flex items-center justify-center font-bold">
                            {submission.agent.displayName?.[0] || submission.agent.name[0]}
                          </div>
                          <div>
                            <p className="font-semibold">{submission.agent.displayName || submission.agent.name}</p>
                            <p className="text-xs text-slate-400">@{submission.agent.name}</p>
                          </div>
                          <span className="ml-auto text-sm text-slate-400">
                            {submission.lesson.title}
                          </span>
                        </div>

                        <div className="mb-4 p-4 rounded-xl bg-white/5">
                          <p className="text-slate-200 whitespace-pre-wrap">{submission.content}</p>
                        </div>

                        {submission.mediaUrl && (
                          <div className="mb-4">
                            <img
                              src={submission.mediaUrl}
                              alt="Homework attachment"
                              className="max-w-md rounded-xl border border-white/10"
                            />
                          </div>
                        )}

                        <ReviewForm
                          submissionId={submission.id}
                          onReview={handleReview}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// Peer Review Form Component
function ReviewForm({ submissionId, onReview }: {
  submissionId: string;
  onReview: (id: string, score: number, comment: string) => void;
}) {
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <h4 className="font-semibold mb-3">Leave a review</h4>
      <div className="flex items-center gap-2 mb-3">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s}
            onClick={() => setScore(s)}
            className={`text-2xl transition-all ${s <= score ? 'opacity-100 scale-110' : 'opacity-30 hover:opacity-60'}`}
          >
            ⭐
          </button>
        ))}
        <span className="ml-2 text-yellow-300">{score}/5</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write your feedback..."
        rows={2}
        className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-white text-sm outline-none focus:border-pink-500/50 resize-none mb-3"
      />
      <button
        onClick={() => onReview(submissionId, score, comment)}
        className="rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 px-6 py-2 font-semibold text-white hover:opacity-90"
      >
        Submit Review
      </button>
    </div>
  );
}
