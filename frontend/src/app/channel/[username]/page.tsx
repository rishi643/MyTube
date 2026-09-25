'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { Play, Users, Video, Calendar, Bell } from 'lucide-react';

interface ChannelData {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
  subscribersCount: number;
  totalVideos: number;
  videos: {
    id: string;
    title: string;
    description: string;
    thumbnailUrl: string | null;
    views: string;
    createdAt: string;
  }[];
}

export default function ChannelPage() {
  const params = useParams();
  const username = params?.username as string;

  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    if (!username) return;

    const fetchChannel = async () => {
      try {
        const res = await api.get(`/channels/${username}`);
        setChannel(res.data.channel);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Channel not found.');
      } finally {
        setLoading(false);
      }
    };

    fetchChannel();
  }, [username]);

  const handleSubscribe = async () => {
    if (!channel) return;
    try {
      const res = await api.post(`/channels/${channel.id}/subscribe`);
      setIsSubscribed(res.data.subscribed);
      setChannel((prev) =>
        prev
          ? {
              ...prev,
              subscribersCount: res.data.subscribed
                ? prev.subscribersCount + 1
                : prev.subscribersCount - 1,
            }
          : null
      );
    } catch {
      alert('Please sign in to subscribe.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <Navbar />
        <div className="max-w-7xl mx-auto p-6 animate-pulse">
          <div className="h-44 bg-zinc-900 rounded-3xl mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-video bg-zinc-900 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !channel) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <Navbar />
        <div className="text-center py-24 text-red-500 text-sm font-medium">
          {error || 'Channel not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />

      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Channel Banner & Identity Header */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 sm:p-8 mb-8 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center font-bold text-3xl border-2 border-zinc-700 shadow-xl">
                {channel.username.charAt(0).toUpperCase()}
              </div>

              <div>
                <h1 className="text-2xl font-bold text-zinc-100">{channel.username}</h1>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 mt-2">
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {channel.subscribersCount} subscribers
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Video className="w-3.5 h-3.5" />
                    {channel.totalVideos} videos
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Joined {new Date(channel.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleSubscribe}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold transition self-start sm:self-auto ${
                isSubscribed
                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  : 'bg-white text-black hover:bg-zinc-200 shadow-md'
              }`}
            >
              <Bell className="w-4 h-4" />
              {isSubscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          </div>
        </div>

        {/* Video Grid */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-6">
          <h2 className="text-lg font-bold text-zinc-100">Uploads</h2>
          <span className="text-xs text-zinc-500">{channel.videos.length} public uploads</span>
        </div>

        {channel.videos.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 text-sm">
            This creator has not uploaded any videos yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {channel.videos.map((v) => (
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
                    <Play className="w-10 h-10 text-white fill-white" />
                  </div>
                </div>

                <div className="px-1">
                  <h3 className="font-semibold text-sm text-zinc-100 group-hover:text-red-400 line-clamp-2 leading-snug transition">
                    {v.title}
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-1">
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