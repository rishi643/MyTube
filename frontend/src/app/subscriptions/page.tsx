'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { Users, Play } from 'lucide-react';

interface SubscribedVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  views: string;
  createdAt: string;
  user: {
    username: string;
  };
}

export default function SubscriptionsPage() {
  const [videos, setVideos] = useState<SubscribedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        const res = await api.get('/videos');
        setVideos(res.data.videos);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Sign in to access your subscriptions feed.');
      } finally {
        setLoading(false);
      }
    };

    fetchFeed();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />

      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 pb-6 border-b border-zinc-800 mb-6">
          <Users className="w-5 h-5 text-red-600" />
          <h1 className="text-xl font-bold text-zinc-100">Subscriptions Feed</h1>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex flex-col gap-3">
                <div className="aspect-video w-full bg-zinc-900 rounded-2xl" />
                <div className="h-4 bg-zinc-900 rounded w-3/4" />
                <div className="h-3 bg-zinc-900 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500 text-sm font-medium">{error}</div>
        ) : videos.length === 0 ? (
          <div className="text-center py-24 text-zinc-500 text-sm">
            No uploads from subscribed channels yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {videos.map((v) => (
              <Link
                key={v.id}
                href={`/watch/${v.id}`}
                className="group flex flex-col gap-3 transition"
              >
                <div className="aspect-video w-full rounded-2xl bg-zinc-900 overflow-hidden relative border border-zinc-800/60 shadow-lg">
                  {v.thumbnailUrl ? (
                    <img
                      src={`${API_BASE}${v.thumbnailUrl}`}
                      alt={v.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-zinc-600 font-medium">
                      No Preview
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Play className="w-8 h-8 text-white fill-white" />
                  </div>
                </div>

                <div className="px-1">
                  <h3 className="font-semibold text-sm text-zinc-100 group-hover:text-red-400 line-clamp-2 leading-snug transition">
                    {v.title}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-1">{v.user.username}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {v.views} views • {new Date(v.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}