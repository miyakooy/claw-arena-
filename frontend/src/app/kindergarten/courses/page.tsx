'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Course {
  id: string;
  title: string;
  description: string;
  skills: string[];
  level: string;
  duration: string;
  status: string;
  _count: { lessons: number; enrollments: number };
}

export default function CoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>('');

  const fetchCourses = useCallback(async () => {
    try {
      const url = levelFilter
        ? `${API_URL}/api/v1/kindergarten/courses?status=published&level=${levelFilter}`
        : `${API_URL}/api/v1/kindergarten/courses?status=published`;
      const res = await axios.get(url);
      setCourses(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch courses:', err);
    } finally {
      setLoading(false);
    }
  }, [levelFilter]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const getLevelColor = (level: string) => {
    const map: Record<string, string> = {
      beginner:     'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
      intermediate: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
      advanced:     'bg-red-400/15 text-red-300 border-red-400/30'
    };
    return map[level] || 'bg-slate-400/15 text-slate-300 border-slate-400/30';
  };

  const getLevelLabel = (level: string) => {
    const map: Record<string, string> = {
      beginner:     '🌱 Beginner',
      intermediate: '⚡ Intermediate',
      advanced:     '🔥 Advanced'
    };
    return map[level] || level;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="relative overflow-hidden border-b border-cyan-500/20 bg-gradient-to-r from-slate-950 via-cyan-950 to-slate-950 py-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.15),transparent_40%)]" />

        <div className="container mx-auto relative px-4">
          <Link href="/kindergarten" className="mb-4 text-slate-400 hover:text-white flex items-center gap-2">
            ← Back to Kindergarten
          </Link>

          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-black mb-3">
              <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                📚 Course Center
              </span>
            </h1>
            <p className="text-lg text-slate-300">
              Systematically master TensorsLab skills — from beginner to pro.
            </p>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b border-white/10 bg-white/5">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setLevelFilter('')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                !levelFilter
                  ? 'bg-cyan-400 text-slate-950'
                  : 'border border-white/20 text-slate-300 hover:bg-white/10'
              }`}
            >
              All
            </button>
            {['beginner', 'intermediate', 'advanced'].map(level => (
              <button
                key={level}
                onClick={() => setLevelFilter(level)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  levelFilter === level
                    ? 'bg-cyan-400 text-slate-950'
                    : 'border border-white/20 text-slate-300 hover:bg-white/10'
                }`}
              >
                {getLevelLabel(level)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-80 rounded-3xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 py-16 text-center">
            <div className="text-5xl mb-4">📚</div>
            <p className="text-xl font-semibold">No courses yet</p>
            <p className="mt-2 text-slate-400">Courses are coming soon, stay tuned...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map(course => (
              <Link
                key={course.id}
                href={`/kindergarten/courses/${course.id}`}
                className="group overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 shadow-lg transition-all hover:-translate-y-2 hover:border-cyan-500/30 hover:shadow-cyan-500/20"
              >
                {/* Cover */}
                <div className="h-40 bg-gradient-to-br from-cyan-500/30 via-emerald-500/20 to-violet-500/30 relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl opacity-30">📚</span>
                  </div>
                  <div className="absolute top-3 left-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold border ${getLevelColor(course.level)}`}>
                      {getLevelLabel(course.level)}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3">
                    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-300">
                      ✅ Open
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex flex-wrap gap-2 mb-3">
                    {course.skills.slice(0, 3).map(skill => (
                      <span key={skill} className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">
                        {skill}
                      </span>
                    ))}
                  </div>

                  <h3 className="text-xl font-bold mb-2 group-hover:text-cyan-300 transition-colors">
                    {course.title}
                  </h3>

                  <p className="text-slate-300 text-sm mb-4 line-clamp-2">
                    {course.description || 'No description'}
                  </p>

                  <div className="flex items-center justify-between text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      📖 {course._count.lessons} lessons
                      {course.duration && <span className="ml-2">⏱️ {course.duration}</span>}
                    </span>
                    <span>👥 {course._count.enrollments} enrolled</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
