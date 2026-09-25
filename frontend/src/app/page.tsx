'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';

interface VideoItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  views: string;
  createdAt: string;
  user: {
    username: string;
    avatarUrl: string | null;
  };
}

export default function HomePage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        const res = await api.get('/videos');
        setVideos(res.data.videos);
      } catch (err) {
        console.error('Failed to load feed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFeed();
  }, []);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />

      <main className="max-w-7xl mx-auto p-6">
        <h1 className="text-xl font-bold mb-6">Recommended</h1>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-56 bg-zinc-900 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            No videos uploaded yet. Be the first to upload one!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {videos.map((vid) => (
              <Link key={vid.id} href={`/watch/${vid.id}`} className="group flex flex-col">
                <div className="aspect-video w-full rounded-xl bg-zinc-800 overflow-hidden relative">
                  {vid.thumbnailUrl ? (
                    <img
                      src={`${API_BASE}${vid.thumbnailUrl}`}
                      alt={vid.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-900">
                      No Thumbnail
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-zinc-700 flex items-center justify-center font-bold text-sm">
                    {vid.user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-semibold line-clamp-2 text-sm text-zinc-100 group-hover:text-red-400 leading-snug">
                      {vid.title}
                    </h2>
                    <p className="text-xs text-zinc-400 mt-1">{vid.user.username}</p>
                    <p className="text-xs text-zinc-500">{vid.views} views</p>
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