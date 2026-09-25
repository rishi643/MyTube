'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { History, Play, Trash2 } from 'lucide-react';

interface HistoryItem {
  id: string;
  progressSec: number;
  completed: boolean;
  updatedAt: string;
  video: {
    id: string;
    title: string;
    description: string;
    thumbnailUrl: string | null;
    views: string;
    user: {
      username: string;
    };
  };
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await api.get('/history');
        setHistory(res.data.history);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Sign in to view your watch history.');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 pb-6 border-b border-zinc-800">
          <History className="w-6 h-6 text-red-600" />
          <h1 className="text-2xl font-bold text-zinc-100">Watch History</h1>
        </div>

        {loading ? (
          <div className="space-y-4 mt-6 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-zinc-900 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 text-zinc-400">
            <p className="text-sm">{error}</p>
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 text-sm">
            You haven't watched any videos yet.
          </div>
        ) : (
          <div className="flex flex-col gap-4 mt-6">
            {history.map((item) => (
              <Link
                key={item.id}
                href={`/watch/${item.video.id}`}
                className="flex flex-col sm:flex-row gap-4 p-3 rounded-2xl bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/60 hover:border-zinc-700 transition group"
              >
                <div className="sm:w-56 aspect-video rounded-xl bg-zinc-800 overflow-hidden shrink-0 relative">
                  {item.video.thumbnailUrl ? (
                    <img
                      src={`${API_BASE}${item.video.thumbnailUrl}`}
                      alt={item.video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-zinc-500">
                      No Thumbnail
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Play className="w-8 h-8 text-white fill-white" />
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    <h3 className="font-semibold text-zinc-100 group-hover:text-red-400 text-base line-clamp-1 transition">
                      {item.video.title}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      {item.video.user.username} • {item.video.views} views
                    </p>
                    <p className="text-xs text-zinc-500 mt-2 line-clamp-2">
                      {item.video.description || 'No description.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-3 sm:mt-0">
                    <span>Last viewed: {new Date(item.updatedAt).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>
                      {item.completed ? 'Completed' : `Resume at ${Math.floor(item.progressSec)}s`}
                    </span>
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