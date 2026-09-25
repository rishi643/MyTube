'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import { UploadCloud, Image as ImageIcon, Film, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

export default function UploadPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setVideoFile(e.target.files[0]);
    }
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setThumbnailFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a title for your video.');
      return;
    }
    if (!videoFile) {
      setError('Please select a video file to upload.');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setProgress(10);

      // Check if S3 Direct Upload is configured
      const useS3 = process.env.NEXT_PUBLIC_ENABLE_S3 === 'true';

      if (useS3) {
        // Step 1: Request Presigned URL
        const presignRes = await api.post('/videos/presigned-url', {
          filename: videoFile.name,
          contentType: videoFile.type,
        });

        const { uploadUrl, key } = presignRes.data;

        // Step 2: Stream directly to S3 / Cloudflare R2
        await axios.put(uploadUrl, videoFile, {
          headers: { 'Content-Type': videoFile.type },
          onUploadProgress: (p) => {
            if (p.total) {
              setProgress(Math.round((p.loaded * 90) / p.total));
            }
          },
        });

        // Step 3: Register upload record
        const completeRes = await api.post('/videos/upload-complete', {
          title,
          description,
          storageKey: key,
        });

        setProgress(100);
        router.push(`/watch/${completeRes.data.video.id}`);
      } else {
        // Fallback: Upload via Gateway Multipart Form
        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('video', videoFile);
        if (thumbnailFile) {
          formData.append('thumbnail', thumbnailFile);
        }

        const res = await api.post('/videos/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (p) => {
            if (p.total) {
              setProgress(Math.round((p.loaded * 100) / p.total));
            }
          },
        });

        router.push(`/watch/${res.data.video.id}`);
      }
    } catch (err: any) {
      console.error('Upload failed:', err);
      setError(err.response?.data?.error || 'Upload failed. Please check your credentials.');
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Navbar />

      <main className="max-w-3xl mx-auto p-4 sm:p-8">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-zinc-800">
            <div className="p-3 bg-red-600/10 text-red-500 rounded-2xl border border-red-500/20">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-100">Upload Video</h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Multi-bitrate encoding and AI metadata enrichment will run in the background.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-4 mb-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your video a descriptive title..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 transition"
                disabled={uploading}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Description
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is your video about? (AI will generate summary and tags if empty)"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-red-500 transition"
                disabled={uploading}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Video Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Video File (.mp4, .mov, .mkv) *
                </label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 rounded-2xl p-6 cursor-pointer transition">
                  <Film className="w-8 h-8 text-zinc-500 mb-2" />
                  <span className="text-xs text-zinc-300 font-medium text-center line-clamp-1">
                    {videoFile ? videoFile.name : 'Select Video'}
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>

              {/* Thumbnail Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Thumbnail (Optional)
                </label>
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 rounded-2xl p-6 cursor-pointer transition">
                  <ImageIcon className="w-8 h-8 text-zinc-500 mb-2" />
                  <span className="text-xs text-zinc-300 font-medium text-center line-clamp-1">
                    {thumbnailFile ? thumbnailFile.name : 'Select Image'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailChange}
                    className="hidden"
                    disabled={uploading}
                  />
                </label>
              </div>
            </div>

            {/* Upload Progress Bar */}
            {uploading && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Uploading media asset...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-red-600 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={uploading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-semibold py-3.5 rounded-xl transition shadow-lg shadow-red-600/20"
            >
              {uploading ? `Transferring (${progress}%)...` : 'Publish Video'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}