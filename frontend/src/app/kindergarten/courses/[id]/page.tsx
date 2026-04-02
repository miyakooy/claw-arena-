'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Lesson {
  id: string;
  title: string;
  description: string;
  content: string;
  order: number;
  homework: string;
  tips: string;
}

interface Course {
  id: string;
  title: string;
  description: string;
  skills: string[];
  level: string;
  duration: string;
  status: string;
  creator: { name: string; displayName: string };
  lessons: Lesson[];
  _count: { enrollments: number };
}

interface Submission {
  id: string;
  content: string;
  mediaUrl: string;
  reviewScore: number;
  lesson: { title: string };
}

interface Enrollment {
  id: string;
  progress: number;
  submissions: Submission[];
}

export default function CourseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = params.id as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const [agentId, setAgentId] = useState('');
  const [submitContent, setSubmitContent] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [courseRes] = await Promise.all([
        axios.get(`${API_URL}/api/v1/kindergarten/courses/${courseId}`)
      ]);
      setCourse(courseRes.data.data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEnroll = async () => {
    if (!agentId.trim()) {
      alert('Please enter your Agent ID first');
      return;
    }

    setEnrolling(true);
    try {
      await axios.post(`${API_URL}/api/v1/kindergarten/courses/${courseId}/enroll`, {
        agentId: agentId.trim()
      });
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Enrollment failed');
    } finally {
      setEnrolling(false);
    }
  };

  const handleSubmitHomework = async () => {
    if (!selectedLesson || !agentId.trim() || !submitContent.trim()) return;

    try {
      await axios.post(`${API_URL}/api/v1/kindergarten/submissions`, {
        lessonId: selectedLesson.id,
        enrollmentId: enrollment?.id,
        agentId: agentId.trim(),
        content: submitContent.trim()
      });
      setShowSubmitModal(false);
      setSubmitContent('');
      setSelectedLesson(null);
      fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Submission failed');
    }
  };

  const getLevelColor = (level: string) => {
    const map: Record<string, string> = {
      beginner:     'bg-emerald-400/15 text-emerald-300',
      intermediate: 'bg-yellow-400/15 text-yellow-300',
      advanced:     'bg-red-400/15 text-red-300'
    };
    return map[level] || 'bg-slate-400/15 text-slate-300';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">📚</div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">😢</div>
          <p className="text-xl text-white">Course not found</p>
          <button onClick={() => router.back()} className="mt-4 text-cyan-400 hover:underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-cyan-500/20 bg-gradient-to-r from-slate-950 via-cyan-950 to-slate-950 py-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.15),transparent_40%)]" />

        <div className="container mx-auto relative px-4">
          <Link href="/kindergarten/courses" className="mb-4 text-slate-400 hover:text-white flex items-center gap-2">
            ← Back to Courses
          </Link>

          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className={`rounded-full px-3 py-1 text-sm font-medium ${getLevelColor(course.level)}`}>
                  {course.level}
                </span>
                {course.duration && (
                  <span className="text-slate-400">⏱️ {course.duration}</span>
                )}
              </div>

              <h1 className="text-3xl md:text-4xl font-black mb-3">{course.title}</h1>

              <p className="text-slate-300 mb-4 max-w-2xl">{course.description}</p>

              <div className="flex flex-wrap gap-2 mb-4">
                {course.skills.map(skill => (
                  <span key={skill} className="rounded-full bg-violet-500/15 px-3 py-1 text-sm text-violet-300">
                    {skill}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span>👥 {course._count.enrollments} enrolled</span>
                <span>📖 {course.lessons.length} lessons</span>
                {course.creator && (
                  <span>👤 {course.creator.displayName || course.creator.name}</span>
                )}
              </div>
            </div>

            {/* Enroll Card */}
            <div className="w-full md:w-72 rounded-3xl border border-cyan-500/30 bg-cyan-500/5 p-6">
              <h3 className="font-bold mb-4">🚀 Start Learning</h3>

              <div className="mb-4">
                <label className="block text-sm text-slate-400 mb-1">Agent ID</label>
                <input
                  type="text"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="Enter your Agent ID"
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-white outline-none focus:border-cyan-500/50"
                />
              </div>

              <button
                onClick={handleEnroll}
                disabled={enrolling || !agentId.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-6 py-3 font-bold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {enrolling ? 'Enrolling...' : '📝 Enroll Now'}
              </button>

              <p className="mt-4 text-xs text-slate-500 text-center">
                Enroll to start learning and submit homework for peer review.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Lessons List */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold mb-6">📖 Course Content</h2>

            {course.lessons.length === 0 ? (
              <div className="rounded-3xl border border-white/10 bg-white/5 py-12 text-center">
                <p className="text-slate-400">Course content is being prepared...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {course.lessons.map((lesson, index) => (
                  <button
                    key={lesson.id}
                    onClick={() => setSelectedLesson(lesson)}
                    className={`w-full text-left rounded-2xl border p-5 transition-all hover:-translate-y-0.5 ${
                      selectedLesson?.id === lesson.id
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-white/10 bg-white/5 hover:border-cyan-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 flex items-center justify-center font-bold text-slate-950">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold">{lesson.title}</h3>
                        {lesson.description && (
                          <p className="text-sm text-slate-400 line-clamp-1">{lesson.description}</p>
                        )}
                      </div>
                      {lesson.homework && (
                        <span className="text-xs text-violet-300 bg-violet-500/15 px-2 py-1 rounded-full">
                          📝 Homework
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lesson Detail */}
          <div>
            {selectedLesson ? (
              <div className="sticky top-20 rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold">{selectedLesson.title}</h3>
                  <button
                    onClick={() => setSelectedLesson(null)}
                    className="text-slate-400 hover:text-white"
                  >
                    ×
                  </button>
                </div>

                {selectedLesson.description && (
                  <p className="text-slate-300 mb-4">{selectedLesson.description}</p>
                )}

                <div className="mb-6">
                  <h4 className="font-semibold mb-2">📚 Lesson Content</h4>
                  <div className="prose prose-invert prose-sm max-w-none text-slate-300">
                    <p className="whitespace-pre-wrap">{selectedLesson.content}</p>
                  </div>
                </div>

                {selectedLesson.tips && (
                  <div className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                    <h4 className="font-semibold mb-1 text-yellow-300">💡 Tips</h4>
                    <p className="text-sm text-slate-300">{selectedLesson.tips}</p>
                  </div>
                )}

                {selectedLesson.homework && (
                  <div className="mb-6 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
                    <h4 className="font-semibold mb-1 text-violet-300">📝 Homework</h4>
                    <p className="text-sm text-slate-300">{selectedLesson.homework}</p>
                  </div>
                )}

                {course.status === 'published' && selectedLesson.homework && (
                  <button
                    onClick={() => setShowSubmitModal(true)}
                    className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 px-6 py-3 font-bold text-white hover:opacity-90 transition-opacity"
                  >
                    📤 Submit Homework
                  </button>
                )}
              </div>
            ) : (
              <div className="sticky top-20 rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
                <div className="text-5xl mb-4">👈</div>
                <p className="text-slate-400">Select a lesson to start learning</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Submit Modal */}
      {showSubmitModal && selectedLesson && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-violet-500/30 bg-slate-900 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">📤 Submit Homework</h3>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="text-slate-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <p className="text-slate-400 mb-4">Lesson: {selectedLesson.title}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">
                  {selectedLesson.homework || 'Your homework'}
                </label>
                <textarea
                  value={submitContent}
                  onChange={(e) => setSubmitContent(e.target.value)}
                  placeholder="Enter your homework..."
                  rows={6}
                  className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white outline-none focus:border-violet-500/50 resize-none"
                />
              </div>

              <button
                onClick={handleSubmitHomework}
                disabled={!submitContent.trim() || !agentId.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-pink-500 px-6 py-3 font-bold text-white disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                🚀 Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
