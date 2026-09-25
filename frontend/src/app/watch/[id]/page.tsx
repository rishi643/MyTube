'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { api } from '@/lib/api';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Calendar,
  Send,
  MessageSquare,
  Bell,
  Check,
  ChevronRight,
  ChevronLeft,
  Gauge,
  Sliders,
  Volume1,
  Sun,
  Tv,
} from 'lucide-react';
import Hls from 'hls.js';

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
}

interface VideoDetail {
  id: string;
  title: string;
  description: string;
  hlsMasterUrl: string;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  tags?: string[];
  views: string;
  createdAt: string;
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}

interface RelatedVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  views: string;
  createdAt: string;
  user: {
    username: string;
  };
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export default function WatchPage() {
  const params = useParams();
  const id = params?.id as string;

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hlsInstanceRef = useRef<Hls | null>(null);
  const hasResumed = useRef(false);
  const lastLoggedSec = useRef(0);

  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<RelatedVideo[]>([]);
  const [likes, setLikes] = useState<number>(0);
  const [dislikes, setDislikes] = useState<number>(0);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id?: string; username?: string } | null>(null);

  // Playback States (Initialized with active audio and controls)
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Scrubber Hover States
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // Settings Menu States
  const [showSettings, setShowSettings] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'quality' | 'speed'>('main');
  const [qualities, setQualities] = useState<{ id: number; label: string; badge?: string }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [ambientMode, setAmbientMode] = useState<boolean>(true);
  const [stableVolume, setStableVolume] = useState<boolean>(true);
  const [annotations, setAnnotations] = useState<boolean>(false);

  const [loading, setLoading] = useState(true);
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    const rawUser = localStorage.getItem('user');
    if (rawUser) {
      try {
        setCurrentUser(JSON.parse(rawUser));
      } catch {
        setCurrentUser(null);
      }
    }
  }, []);

  // Step 1: Fetch Video Details Instantly
  useEffect(() => {
    if (!id) return;
    let isMounted = true;

    const fetchPrimaryVideo = async () => {
      try {
        const videoRes = await api.get(`/videos/${id}`);
        if (!isMounted) return;

        const primaryVideo = videoRes.data.video;
        setVideo(primaryVideo);
        setLoading(false);

        // Fetch remaining secondary data in parallel
        api.get(`/videos/${id}/interactions`).then((res) => {
          if (isMounted) {
            setLikes(res.data.likes);
            setDislikes(res.data.dislikes);
            setComments(res.data.comments);
          }
        }).catch(() => {});

        api.get('/videos').then((res) => {
          if (isMounted) {
            setRelatedVideos(res.data.videos.filter((v: RelatedVideo) => v.id !== id));
          }
        }).catch(() => {});

        if (primaryVideo?.user?.username) {
          api.get(`/channels/${encodeURIComponent(primaryVideo.user.username)}/is-subscribed`).then((res) => {
            if (isMounted) setIsSubscribed(res.data.subscribed);
          }).catch(() => {});
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.response?.data?.error || 'Failed to load video stream.');
          setLoading(false);
        }
      }
    };

    fetchPrimaryVideo();

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Transcoding Poller (Runs only while PROCESSING)
  useEffect(() => {
    if (!video || video.status !== 'PROCESSING') return;

    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/videos/${id}/status`);
        if (res.data.status === 'READY') {
          setVideo((prev) =>
            prev ? { ...prev, status: 'READY', hlsMasterUrl: res.data.hlsMasterUrl } : null
          );
          clearInterval(interval);
        } else if (res.data.status === 'FAILED') {
          setError('Transcoding failed for this video.');
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Status check error:', err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [id, video?.status]);

  // Resume Playback Progress
  useEffect(() => {
    if (!id || !video || video.status !== 'READY') return;

    api.get(`/videos/${id}/progress`).then((res) => {
      if (res.data?.progressSec && videoRef.current && !hasResumed.current) {
        videoRef.current.currentTime = res.data.progressSec;
        hasResumed.current = true;
      }
    }).catch(() => {});
  }, [id, video?.status]);

  // Fast Stream Initialization & Buffer Optimization
  useEffect(() => {
    if (!video || video.status !== 'READY' || !videoRef.current) return;

    const streamSrc = `${API_BASE}${video.hlsMasterUrl}`;

    if (video.hlsMasterUrl.endsWith('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          capLevelToPlayerSize: true,
          autoStartLoad: true,
          startLevel: -1,
          maxBufferLength: 8,             // Low initial buffer for immediate first frame
          maxMaxBufferLength: 20,
          maxBufferSize: 15 * 1000 * 1000,
          lowLatencyMode: true,
          enableWorker: true,
        });
        hlsInstanceRef.current = hls;

        hls.loadSource(streamSrc);
        hls.attachMedia(videoRef.current);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          const parsed = data.levels
            .map((lvl, index) => {
              const h = lvl.height || (index === 0 ? 1080 : index === 1 ? 720 : 480);
              return {
                id: index,
                label: `${h}p`,
                badge: h >= 720 ? 'HD' : undefined,
              };
            })
            .filter((lvl) => lvl.label !== '0p');

          parsed.sort((a, b) => parseInt(b.label) - parseInt(a.label));
          setQualities(parsed);

          // Trigger playback safely
          if (videoRef.current) {
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => setIsPlaying(true))
                .catch(() => {
                  // Fallback: If browser blocks unmuted autoplay, mute once and play
                  if (videoRef.current) {
                    videoRef.current.muted = true;
                    setIsMuted(true);
                    videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
                  }
                });
            }
          }
        });

        // Trigger playback immediately when the first chunk downloads
        hls.on(Hls.Events.FRAG_LOADED, () => {
          if (videoRef.current && videoRef.current.paused && !videoRef.current.seeking) {
            videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
          if (hls.autoLevelEnabled) {
            setCurrentQuality(-1);
          }
        });

        return () => {
          hls.destroy();
          hlsInstanceRef.current = null;
        };
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = streamSrc;
      }
    } else {
      videoRef.current.src = streamSrc;
    }
  }, [video, API_BASE]);

  const togglePlay = () => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((err) => {
            if (err.name !== 'AbortError') {
              console.warn('Playback error:', err);
            }
          });
      }
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleTimeUpdate = async () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;

    setCurrentTime(current);
    setDuration(dur);

    if (videoRef.current.buffered.length > 0) {
      setBufferedEnd(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }

    if (Math.abs(current - lastLoggedSec.current) > 5) {
      lastLoggedSec.current = current;
      try {
        await api.post(`/videos/${id}/progress`, {
          progressSec: current,
          completed: dur > 0 && current / dur >= 0.9,
        });
      } catch {
        // Ignored
      }
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !videoRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const targetTime = pos * duration;
    videoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos * 100);
    setHoverTime(pos * duration);
  };

  const handleProgressBarMouseLeave = () => {
    setHoverPosition(null);
    setHoverTime(null);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const targetMute = !isMuted;
    videoRef.current.muted = targetMute;
    setIsMuted(targetMute);
    if (!targetMute && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
  };

  const toggleFullscreen = () => {
    if (!playerContainerRef.current) return;
    if (!document.fullscreenElement) {
      playerContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const changeQuality = (levelIndex: number) => {
    if (!hlsInstanceRef.current) return;
    hlsInstanceRef.current.currentLevel = levelIndex;
    setCurrentQuality(levelIndex);
    setShowSettings(false);
    setMenuView('main');
  };

  const changePlaybackSpeed = (speed: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = speed;
    setPlaybackSpeed(speed);
    setShowSettings(false);
    setMenuView('main');
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showSettings) setShowControls(false);
    }, 2500);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleLike = async (isLike: boolean) => {
    try {
      await api.post(`/videos/${id}/like`, { isLike });
      const updated = await api.get(`/videos/${id}/interactions`);
      setLikes(updated.data.likes);
      setDislikes(updated.data.dislikes);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Sign in to rate.');
    }
  };

  const handleSubscribe = async () => {
    if (!video?.user) return;

    if (currentUser?.username === video.user.username) {
      alert('You cannot subscribe to your own channel.');
      return;
    }

    try {
      const targetIdentifier = video.user.username || video.user.id;
      const res = await api.post(`/channels/${encodeURIComponent(targetIdentifier)}/subscribe`);
      setIsSubscribed(res.data.subscribed);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Unable to update subscription.');
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      setCommentLoading(true);
      const res = await api.post(`/videos/${id}/comments`, { content: newComment });
      setComments([res.data.comment, ...comments]);
      setNewComment('');
    } catch (err: any) {
      alert(err.response?.data?.error || 'Sign in to comment.');
    } finally {
      setCommentLoading(false);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Navbar />
        <div className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
          <div className="lg:col-span-2">
            <div className="aspect-video w-full bg-zinc-900 rounded-2xl mb-4" />
            <div className="h-6 w-2/3 bg-zinc-900 rounded-lg mb-3" />
            <div className="h-10 w-full bg-zinc-900 rounded-xl" />
          </div>
          <div className="hidden lg:block space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="w-40 aspect-video bg-zinc-900 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-zinc-900 rounded w-full" />
                  <div className="h-3 bg-zinc-900 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <Navbar />
        <div className="text-center py-20 text-red-500 font-medium">
          {error || 'Video not found.'}
        </div>
      </div>
    );
  }

  const isOwnChannel = currentUser?.username === video.user.username;

  return (
    <div className={`min-h-screen bg-[#0f0f0f] text-white select-none ${ambientMode ? 'relative overflow-x-hidden' : ''}`}>
      {ambientMode && (
        <div className="pointer-events-none absolute top-12 left-1/4 w-[600px] h-[350px] bg-red-600/10 blur-[140px] rounded-full -z-10 transition-opacity duration-1000" />
      )}

      <Navbar />

      <main className="max-w-7xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* Main YouTube Stage */}
          <div
            ref={playerContainerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => isPlaying && !showSettings && setShowControls(false)}
            className="aspect-video w-full rounded-2xl overflow-hidden bg-black shadow-2xl relative group flex items-center justify-center border border-zinc-900"
          >
            {video.status === 'PROCESSING' ? (
              <div className="flex flex-col items-center gap-4 text-center p-6">
                <div className="w-16 h-16 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                <div>
                  <h3 className="text-lg font-semibold text-zinc-100">Transcoding Video Segments</h3>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                    Encoding 1080p, 720p, and 480p streams. Playback will begin automatically.
                  </p>
                </div>
              </div>
            ) : video.status === 'FAILED' ? (
              <div className="text-red-500 font-medium text-sm">
                Transcoding failed. Please re-upload this file.
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  onClick={togglePlay}
                  onTimeUpdate={handleTimeUpdate}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full h-full object-contain cursor-pointer"
                />

                {!isPlaying && (
                  <button
                    onClick={togglePlay}
                    className="absolute z-10 w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition duration-200"
                  >
                    <Play className="w-8 h-8 fill-white ml-1" />
                  </button>
                )}

                <div
                  className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 pb-3 pt-12 transition-opacity duration-300 ${
                    showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  {/* YouTube Interactive Dual-Layer Progress Track */}
                  <div
                    ref={progressBarRef}
                    onClick={handleProgressBarClick}
                    onMouseMove={handleProgressBarMouseMove}
                    onMouseLeave={handleProgressBarMouseLeave}
                    className="relative group/track w-full h-3 flex items-end cursor-pointer mb-2"
                  >
                    {hoverPosition !== null && hoverTime !== null && (
                      <div
                        className="absolute bottom-5 -translate-x-1/2 bg-zinc-900 border border-zinc-700 text-white text-[11px] font-semibold px-2 py-0.5 rounded shadow-lg pointer-events-none"
                        style={{ left: `${hoverPosition}%` }}
                      >
                        {formatTime(hoverTime)}
                      </div>
                    )}

                    <div className="w-full h-1 group-hover/track:h-1.5 bg-white/20 rounded-full overflow-hidden relative transition-all">
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-white/40 rounded-full"
                        style={{ width: `${bufferPercent}%` }}
                      />
                      <div
                        className="absolute left-0 top-0 bottom-0 bg-red-600 rounded-full"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-red-600 rounded-full scale-0 group-hover/track:scale-100 transition-transform duration-150 shadow-md pointer-events-none"
                      style={{ left: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-zinc-200">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={togglePlay}
                        className="hover:text-white transition"
                        title={isPlaying ? 'Pause (k)' : 'Play (k)'}
                      >
                        {isPlaying ? (
                          <Pause className="w-5 h-5 fill-current" />
                        ) : (
                          <Play className="w-5 h-5 fill-current" />
                        )}
                      </button>

                      <div className="flex items-center gap-2 group/volume">
                        <button onClick={toggleMute} className="hover:text-white transition">
                          {isMuted || volume === 0 ? (
                            <VolumeX className="w-5 h-5" />
                          ) : (
                            <Volume2 className="w-5 h-5" />
                          )}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={isMuted ? 0 : volume}
                          onChange={handleVolumeChange}
                          className="w-0 group-hover/volume:w-16 transition-all duration-200 h-1 bg-zinc-600 appearance-none accent-white cursor-pointer rounded-full"
                        />
                      </div>

                      <div className="text-xs font-medium text-zinc-300 tracking-wide">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 relative">
                      <div className="relative">
                        <button
                          onClick={() => {
                            setShowSettings(!showSettings);
                            setMenuView('main');
                          }}
                          className={`p-1.5 hover:text-white transition rounded-full ${
                            showSettings ? 'rotate-45 text-white' : ''
                          }`}
                          title="Settings"
                        >
                          <Settings className="w-5 h-5" />
                        </button>

                        {showSettings && (
                          <div className="absolute right-0 bottom-10 w-72 bg-[#1c1c1c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-1.5 text-xs z-50">
                            {menuView === 'main' && (
                              <div className="py-1 flex flex-col gap-0.5">
                                <div
                                  onClick={() => setStableVolume(!stableVolume)}
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl transition cursor-pointer"
                                >
                                  <span className="flex items-center gap-3 text-zinc-100 font-medium text-[13px]">
                                    <Volume1 className="w-4 h-4 text-zinc-400" />
                                    Stable Volume
                                  </span>
                                  <div
                                    className={`w-9 h-5 flex items-center rounded-full p-1 transition-colors duration-200 ${
                                      stableVolume ? 'bg-white' : 'bg-zinc-700'
                                    }`}
                                  >
                                    <div
                                      className={`bg-[#1c1c1c] w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-200 ${
                                        stableVolume ? 'translate-x-3.5' : 'translate-x-0'
                                      }`}
                                    />
                                  </div>
                                </div>

                                <div
                                  onClick={() => setAmbientMode(!ambientMode)}
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl transition cursor-pointer"
                                >
                                  <span className="flex items-center gap-3 text-zinc-100 font-medium text-[13px]">
                                    <Sun className="w-4 h-4 text-zinc-400" />
                                    Ambient mode
                                  </span>
                                  <div
                                    className={`w-9 h-5 flex items-center rounded-full p-1 transition-colors duration-200 ${
                                      ambientMode ? 'bg-white' : 'bg-zinc-700'
                                    }`}
                                  >
                                    <div
                                      className={`bg-[#1c1c1c] w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-200 ${
                                        ambientMode ? 'translate-x-3.5' : 'translate-x-0'
                                      }`}
                                    />
                                  </div>
                                </div>

                                <div
                                  onClick={() => setAnnotations(!annotations)}
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl transition cursor-pointer"
                                >
                                  <span className="flex items-center gap-3 text-zinc-100 font-medium text-[13px]">
                                    <Tv className="w-4 h-4 text-zinc-400" />
                                    Annotations
                                  </span>
                                  <div
                                    className={`w-9 h-5 flex items-center rounded-full p-1 transition-colors duration-200 ${
                                      annotations ? 'bg-white' : 'bg-zinc-700'
                                    }`}
                                  >
                                    <div
                                      className={`bg-[#1c1c1c] w-3.5 h-3.5 rounded-full shadow-md transform transition-transform duration-200 ${
                                        annotations ? 'translate-x-3.5' : 'translate-x-0'
                                      }`}
                                    />
                                  </div>
                                </div>

                                <div className="h-px bg-white/10 my-1" />

                                <button
                                  onClick={() => setMenuView('speed')}
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl transition"
                                >
                                  <span className="flex items-center gap-3 text-zinc-100 font-medium text-[13px]">
                                    <Gauge className="w-4 h-4 text-zinc-400" />
                                    Playback speed
                                  </span>
                                  <span className="flex items-center text-zinc-400 text-xs">
                                    {playbackSpeed === 1 ? 'Normal' : `${playbackSpeed}x`}
                                    <ChevronRight className="w-4 h-4 ml-1.5" />
                                  </span>
                                </button>

                                <button
                                  onClick={() => setMenuView('quality')}
                                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl transition"
                                >
                                  <span className="flex items-center gap-3 text-zinc-100 font-medium text-[13px]">
                                    <Sliders className="w-4 h-4 text-zinc-400" />
                                    Quality
                                  </span>
                                  <span className="flex items-center text-zinc-400 text-xs">
                                    {currentQuality === -1
                                      ? 'Auto'
                                      : qualities.find((q) => q.id === currentQuality)?.label || 'Auto'}
                                    <ChevronRight className="w-4 h-4 ml-1.5" />
                                  </span>
                                </button>
                              </div>
                            )}

                            {menuView === 'quality' && (
                              <div className="py-1 max-h-72 overflow-y-auto">
                                <button
                                  onClick={() => setMenuView('main')}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-white/10 text-zinc-400 hover:text-white transition font-semibold text-xs mb-1"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                  Quality
                                </button>

                                <button
                                  onClick={() => changeQuality(-1)}
                                  className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl transition text-[13px] ${
                                    currentQuality === -1 ? 'bg-white/10 text-white font-semibold' : 'text-zinc-300'
                                  }`}
                                >
                                  <span>Auto (recommended)</span>
                                  {currentQuality === -1 && <Check className="w-4 h-4 text-white" />}
                                </button>

                                {qualities.map((q) => (
                                  <button
                                    key={q.id}
                                    onClick={() => changeQuality(q.id)}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/10 rounded-xl transition text-[13px] ${
                                      currentQuality === q.id ? 'bg-white/10 text-white font-semibold' : 'text-zinc-300'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      {q.label}
                                      {q.badge && (
                                        <span className="bg-red-600/30 text-red-400 border border-red-500/30 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                          {q.badge}
                                        </span>
                                      )}
                                    </span>
                                    {currentQuality === q.id && <Check className="w-4 h-4 text-white" />}
                                  </button>
                                ))}
                              </div>
                            )}

                            {menuView === 'speed' && (
                              <div className="py-1 max-h-72 overflow-y-auto">
                                <button
                                  onClick={() => setMenuView('main')}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-white/10 text-zinc-400 hover:text-white transition font-semibold text-xs mb-1"
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                  Playback speed
                                </button>
                                {PLAYBACK_SPEEDS.map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => changePlaybackSpeed(s)}
                                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-white/10 rounded-xl transition text-[13px] ${
                                      playbackSpeed === s ? 'bg-white/10 text-white font-semibold' : 'text-zinc-300'
                                    }`}
                                  >
                                    <span>{s === 1 ? 'Normal' : `${s}x`}</span>
                                    {playbackSpeed === s && <Check className="w-4 h-4 text-white" />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <button
                        onClick={toggleFullscreen}
                        className="p-1 hover:text-white transition"
                        title={isFullscreen ? 'Exit full screen (f)' : 'Full screen (f)'}
                      >
                        {isFullscreen ? (
                          <Minimize className="w-5 h-5" />
                        ) : (
                          <Maximize className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold mt-4 text-zinc-100">{video.title}</h1>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 pb-4 border-b border-zinc-800">
            <div className="flex items-center gap-4">
              <Link
                href={`/channel/${encodeURIComponent(video.user.username)}`}
                className="flex items-center gap-3 hover:opacity-85 transition group"
              >
                <div className="h-11 w-11 rounded-full bg-red-600 flex items-center justify-center font-bold text-base border border-zinc-700 shadow-md">
                  {video.user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-zinc-100 group-hover:text-red-400 transition">
                    {video.user.username}
                  </p>
                  <p className="text-xs text-zinc-400">Creator</p>
                </div>
              </Link>

              {!isOwnChannel && (
                <button
                  onClick={handleSubscribe}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition ${
                    isSubscribed
                      ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      : 'bg-white text-black hover:bg-zinc-200'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  {isSubscribed ? 'Subscribed' : 'Subscribe'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-full overflow-hidden">
                <button
                  onClick={() => handleLike(true)}
                  className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-800 transition text-sm font-medium border-r border-zinc-800"
                >
                  <ThumbsUp className="w-4 h-4 text-zinc-300" />
                  <span>{likes}</span>
                </button>
                <button
                  onClick={() => handleLike(false)}
                  className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-800 transition text-sm font-medium text-zinc-400"
                >
                  <ThumbsDown className="w-4 h-4" />
                  <span>{dislikes}</span>
                </button>
              </div>

              <div className="flex items-center gap-3 text-sm text-zinc-400 bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-full">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4" />
                  {video.views}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {new Date(video.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
            {video.description || 'No description provided.'}

            {video.tags && video.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-zinc-800/80">
                {video.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md font-medium hover:bg-zinc-700 cursor-pointer transition"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <section className="mt-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-red-500" />
              {comments.length} Comments
            </h2>

            <form onSubmit={handleCommentSubmit} className="flex gap-3 mb-6">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a public comment..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                disabled={commentLoading || !newComment.trim()}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 px-5 py-2.5 rounded-xl font-medium text-sm transition"
              >
                <Send className="w-4 h-4" />
                Post
              </button>
            </form>

            <div className="space-y-4">
              {comments.map((comm) => (
                <div
                  key={comm.id}
                  className="flex gap-3 p-3 rounded-xl bg-zinc-900/30 border border-zinc-800/60"
                >
                  <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs shrink-0">
                    {comm.user.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200">
                        {comm.user.username}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {new Date(comm.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-300 mt-1">{comm.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <h2 className="text-base font-bold text-zinc-200">Recommended Videos</h2>
          <div className="flex flex-col gap-3">
            {relatedVideos.map((item) => (
              <Link
                key={item.id}
                href={`/watch/${item.id}`}
                className="flex gap-3 rounded-xl p-2 hover:bg-zinc-900 border border-transparent hover:border-zinc-800/60 transition group"
              >
                <div className="w-40 aspect-video rounded-lg bg-zinc-800 overflow-hidden shrink-0 relative">
                  {item.thumbnailUrl ? (
                    <img
                      src={`${API_BASE}${item.thumbnailUrl}`}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">
                      No Preview
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-200 line-clamp-2 leading-snug group-hover:text-red-400 transition">
                    {item.title}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">{item.user.username}</p>
                  <p className="text-[11px] text-zinc-500">{item.views} views</p>
                </div>
              </Link>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}