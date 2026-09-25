'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { Search, Play } from 'lucide-react';

interface VideoSearchResult {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  tags?: string[];
  views: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

function SearchResultsContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';

  const [videos, setVideos] = useState<VideoSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    if (!query.trim()) {
      setVideos([]);
      setLoading(false);
      return;
    }

    const runSearch = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/videos/search?q=${encodeURIComponent(query)}`);
        setVideos(res.data.videos);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to execute search.');
      } finally {
        setLoading(false);
      }
    };

    runSearch();
  }, [query]);

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <div className="flex items-center gap-3 pb-6 border-b border-zinc-800 mb-6">
        <Search className="w-5 h-5 text-red-600" />
        <h1 className="text-xl font-bold text-zinc-100">
          Search results for &ldquo;{query}&rdquo;
        </h1>
      </div>

      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-4 p-3 bg-zinc-900/40 rounded-2xl">
              <div className="sm:w-64 aspect-video bg-zinc-900 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2 py-2">
                <div className="h-4 bg-zinc-900 rounded w-3/4" />
                <div className="h-3 bg-zinc-900 rounded w-1/4" />
                <div className="h-3 bg-zinc-900 rounded w-1/2 mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-20 text-red-500 text-sm">{error}</div>
      ) : videos.length === 0 ? (
        <div className="text-center py-24 text-zinc-500 text-sm">
          No videos matched &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {videos.map((video) => (
            <Link
              key={video.id}
              href={`/watch/${video.id}`}
              className="flex flex-col sm:flex-row gap-4 p-3 rounded-2xl bg-zinc-900/30 hover:bg-zinc-900 border border-zinc-800/60 hover:border-zinc-700 transition group"
            >
              <div className="sm:w-64 aspect-video rounded-xl bg-zinc-900 overflow-hidden shrink-0 relative border border-zinc-800">
                {video.thumbnailUrl ? (
                  <img
                    src={`${API_BASE}${video.thumbnailUrl}`}
                    alt={video.title}
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

              <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
                <div>
                  <h2 className="font-semibold text-base text-zinc-100 group-hover:text-red-400 line-clamp-2 transition leading-snug">
                    {video.title}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1.5">
                    <span>{video.user.username}</span>
                    <span>•</span>
                    <span>{video.views} views</span>
                    <span>•</span>
                    <span>{new Date(video.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-zinc-400 line-clamp-2 mt-2 leading-relaxed">
                    {video.description || 'No description provided.'}
                  </p>
                </div>

                {video.tags && video.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {video.tags.slice(0, 4).map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

export default function SearchResultsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />
      <Suspense
        fallback={
          <div className="max-w-6xl mx-auto p-6 animate-pulse">
            <div className="h-6 w-48 bg-zinc-900 rounded mb-6" />
            <div className="h-32 bg-zinc-900 rounded-2xl" />
          </div>
        }
      >
        <SearchResultsContent />
      </Suspense>
    </div>
  );
}