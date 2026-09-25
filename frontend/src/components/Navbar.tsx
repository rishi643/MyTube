'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Video, Search, Upload, User, LogOut, LayoutDashboard } from 'lucide-react';

export default function Navbar() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<{ id?: string; username?: string; avatarUrl?: string } | null>(null);

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    if (rawUser) {
      try {
        setUser(JSON.parse(rawUser));
      } catch {
        setUser(null);
      }
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0f0f0f]/95 backdrop-blur-md border-b border-zinc-800 px-4 sm:px-6 py-2.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 font-black text-xl tracking-tight shrink-0">
          <div className="bg-red-600 p-1.5 rounded-xl">
            <Video className="w-5 h-5 text-white" />
          </div>
          <span className="hidden sm:inline">
            My<span className="text-red-600">Tube</span>
          </span>
        </Link>

        {/* Global Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-xl mx-2">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-full pl-4 pr-10 py-2 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-red-500 transition"
            />
            <button
              type="submit"
              className="absolute right-3 text-zinc-400 hover:text-zinc-100 transition"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {user ? (
            <>
              {/* Studio Button - ALWAYS VISIBLE */}
              <Link
                href="/studio"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-white shadow-sm transition"
                title="Creator Studio (Manage Videos)"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-red-500" />
                <span>Studio</span>
              </Link>

              {/* Upload Button */}
              <Link
                href="/upload"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Upload</span>
              </Link>

              {/* User Profile */}
              <Link
                href={`/channel/${encodeURIComponent(user.username || '')}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-200 transition"
              >
                <div className="w-4 h-4 rounded-full bg-red-600 flex items-center justify-center text-[10px] text-white">
                  {user.username?.charAt(0).toUpperCase()}
                </div>
                <span>{user.username}</span>
              </Link>

              {/* Sign Out */}
              <button
                onClick={handleLogout}
                className="p-2 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-red-400 transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              href="/auth"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}