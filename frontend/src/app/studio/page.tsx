'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { Video, Edit3, Trash2, Eye, Calendar, UploadCloud, X, ImageIcon } from 'lucide-react';

interface ManageVideo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  views: string;
  tags?: string[];
  createdAt: string;
}

export default function StudioPage() {
  const [videos, setVideos] = useState<ManageVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit State
  const [editingVideo, setEditingVideo] = useState<ManageVideo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [selectedThumbnail, setSelectedThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchMyVideos = async () => {
    try {
      setLoading(true);
      const res = await api.get('/videos/me/videos');
      setVideos(res.data.videos);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load your videos. Please sign in.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyVideos();
  }, []);

  const openEditModal = (v: ManageVideo) => {
    setEditingVideo(v);
    setEditTitle(v.title);
    setEditDescription(v.description || '');
    setEditTags(v.tags ? v.tags.join(', ') : '');
    setSelectedThumbnail(null);
    setThumbnailPreview(v.thumbnailUrl ? `${API_BASE}${v.thumbnailUrl}` : null);
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedThumbnail(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVideo) return;

    try {
      setIsSubmitting(true);
      const parsedTags = editTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // Step 1: Update metadata
      await api.put(`/videos/${editingVideo.id}`, {
        title: editTitle,
        description: editDescription,
        tags: parsedTags,
      });

      let updatedThumbUrl = editingVideo.thumbnailUrl;

      // Step 2: If a new thumbnail file was chosen, upload it
      if (selectedThumbnail) {
        const formData = new FormData();
        formData.append('thumbnail', selectedThumbnail);
        const thumbRes = await api.post(`/videos/${editingVideo.id}/thumbnail`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        updatedThumbUrl = thumbRes.data.thumbnailUrl;
      }

      setVideos((prev) =>
        prev.map((v) =>
          v.id === editingVideo.id
            ? {
                ...v,
                title: editTitle,
                description: editDescription,
                tags: parsedTags,
                thumbnailUrl: updatedThumbUrl,
              }
            : v
        )
      );

      setEditingVideo(null);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to update video.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (videoId: string) => {
    if (!confirm('Are you sure you want to permanently delete this video?')) return;

    try {
      await api.delete(`/videos/${videoId}`);
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete video.');
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white">
      <Navbar />

      <main className="max-w-7xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between pb-6 border-b border-zinc-800 mb-6">
          <div className="flex items-center gap-3">
            <Video className="w-6 h-6 text-red-600" />
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Channel Content</h1>
              <p className="text-xs text-zinc-400">Manage, edit thumbnails, and organize your uploaded videos</p>
            </div>
          </div>
          <Link
            href="/upload"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-xs font-semibold rounded-xl transition"
          >
            Upload New Video
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-zinc-900 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500 text-sm font-medium">{error}</div>
        ) : videos.length === 0 ? (
          <div className="text-center py-24 text-zinc-500 text-sm">
            You haven&apos;t uploaded any videos yet.
          </div>
        ) : (
          <div className="overflow-x-auto border border-zinc-800 rounded-2xl bg-zinc-900/40">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="py-3 px-4 font-semibold">Video</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Views</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {videos.map((v) => (
                  <tr key={v.id} className="hover:bg-zinc-800/40 transition">
                    <td className="py-3 px-4 flex items-center gap-3 min-w-[280px]">
                      <div className="w-24 aspect-video rounded-lg bg-zinc-900 overflow-hidden relative shrink-0 border border-zinc-800 group/thumb">
                        {v.thumbnailUrl ? (
                          <img
                            src={`${API_BASE}${v.thumbnailUrl}`}
                            alt={v.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600">
                            No Prev
                          </div>
                        )}
                        <button
                          onClick={() => openEditModal(v)}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition text-[10px] font-semibold text-white gap-1"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          Change
                        </button>
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/watch/${v.id}`}
                          className="font-semibold text-zinc-200 hover:text-red-400 line-clamp-1 transition"
                        >
                          {v.title}
                        </Link>
                        <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                          {v.description || 'No description'}
                        </p>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          v.status === 'READY'
                            ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                            : v.status === 'PROCESSING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {v.status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </td>

                    <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">{v.views}</td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(v)}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
                          title="Edit Details & Thumbnail"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="p-1.5 rounded-lg bg-red-600/10 hover:bg-red-600/20 text-red-400 transition"
                          title="Delete Video"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit Modal (Metadata & Thumbnail Editor) */}
        {editingVideo && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#181818] border border-zinc-800 rounded-3xl w-full max-w-xl p-6 shadow-2xl animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
                <h2 className="text-base font-bold text-zinc-100">Edit Video & Thumbnail</h2>
                <button
                  onClick={() => setEditingVideo(null)}
                  className="p-1 text-zinc-400 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdate} className="space-y-4 text-xs">
                {/* Thumbnail Preview & Picker */}
                <div>
                  <label className="block text-zinc-400 font-semibold mb-2">Video Thumbnail</label>
                  <div className="flex items-center gap-4">
                    <div className="w-44 aspect-video rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden relative flex items-center justify-center shrink-0">
                      {thumbnailPreview ? (
                        <img
                          src={thumbnailPreview}
                          alt="Thumbnail Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-zinc-600 text-center p-2 text-[10px]">
                          No thumbnail selected
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*"
                        onChange={handleThumbnailSelect}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition text-xs font-semibold"
                      >
                        <UploadCloud className="w-4 h-4 text-red-500" />
                        Choose New Image
                      </button>
                      <p className="text-[11px] text-zinc-500 mt-2">
                        Supported formats: JPG, PNG, WebP (16:9 recommended)
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Description</label>
                  <textarea
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="react, tech, podcast"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setEditingVideo(null)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !editTitle.trim()}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-semibold transition"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}