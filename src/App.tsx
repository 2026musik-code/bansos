import { useState, useEffect, FormEvent, useRef } from 'react';
import { Search, Play, Tv, ChevronLeft, X, LayoutGrid, Crown, Loader2, Sparkles, Popcorn, User, Key, Globe, Smartphone, MessageCircle, Send, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Hls from 'hls.js';

// --- Types (Flexible to accommodate unknown API schemas) ---
type ViewState = 'home' | 'details' | 'player' | 'history' | 'categories' | 'profile';

// Simple HLS Player Component
const HlsPlayer = ({ src, className, style, onEnded }: { src: string, className?: string, style?: any, onEnded?: () => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    
    if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30, enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log('Autoplay blocked:', e));
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native support (Safari / iOS)
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.log('Autoplay blocked:', e));
      });
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [src]);

  return <video ref={videoRef} className={className} style={style} controls playsInline onEnded={onEnded} />;
};

export default function App() {
  const [view, setView] = useState<ViewState>('home');
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [selectedDrama, setSelectedDrama] = useState<any | null>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

  const [streamData, setStreamData] = useState<any | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState<any | null>(null);

  const [trendingDramas, setTrendingDramas] = useState<any[]>([]);
  const [isLoadingTrending, setIsLoadingTrending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [profileData, setProfileData] = useState({ ip: 'Loading...', userAgent: 'Loading...' });
  const [limitData, setLimitData] = useState<{ exceeded: boolean, popupText: string, qrImage: string, user: any } | null>(null);
  const [showLimitPopup, setShowLimitPopup] = useState(false);
  const [showPlayerUI, setShowPlayerUI] = useState(true);
  const playerUiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetPlayerUiTimer = () => {
    setShowPlayerUI(true);
    if (playerUiTimeoutRef.current) clearTimeout(playerUiTimeoutRef.current);
    playerUiTimeoutRef.current = setTimeout(() => {
      setShowPlayerUI(false);
    }, 3000);
  };

  useEffect(() => {
    if (view === 'player') {
      resetPlayerUiTimer();
    }
    return () => {
      if (playerUiTimeoutRef.current) clearTimeout(playerUiTimeoutRef.current);
    };
  }, [view, streamData]);

  // Ping tracking to get user info on mount/view profile
  useEffect(() => {
    const getDeviceId = () => {
      let did = localStorage.getItem('deviceId');
      if (!did) {
        did = 'uid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('deviceId', did);
      }
      return did;
    };

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ping', deviceId: getDeviceId() })
    })
      .then(res => res.json())
      .then(data => setLimitData(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (view === 'profile') {
      setProfileData(prev => ({ ...prev, userAgent: navigator.userAgent }));
      fetch('https://api.ipify.org?format=json')
        .then(res => res.json())
        .then(data => setProfileData(prev => ({ ...prev, ip: data.ip })))
        .catch(() => setProfileData(prev => ({ ...prev, ip: 'Unknown' })));
    }
  }, [view]);

  // 1. Fetch Providers
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await fetch('/api/providers');
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error('Providers fetch error raw text:', text);
          throw e;
        }
        
        let providerList: any[] = [];
        if (Array.isArray(data)) {
          providerList = data;
        } else if (data && data.data && Array.isArray(data.data)) {
          providerList = data.data;
        } else if (data && typeof data === 'object') {
          providerList = Object.keys(data).map(k => ({ id: k, name: data[k].name || k }));
        }

        const allowed = ['reelshort', 'netshort', 'freereels', 'dotdrama', 'stardusttv', 'meloshort'];
        const filteredProviders = providerList.filter(p => allowed.includes(String(p.id || p.name || p).toLowerCase()));
        
        setProviders(filteredProviders.length > 0 ? filteredProviders : allowed.map(id => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) })));
        
        if (filteredProviders.length > 0) {
          const defaultProv = filteredProviders.find(p => String(p.id | p.name | p).toLowerCase() === 'freereels') || filteredProviders[0];
          setSelectedProvider(defaultProv.id || defaultProv.name || defaultProv);
        } else {
          setSelectedProvider('freereels');
        }
      } catch (err) {
        console.error("Error fetching providers:", err);
        const allowed = ['reelshort', 'netshort', 'freereels', 'dotdrama', 'stardusttv', 'meloshort'];
        setProviders(allowed.map(id => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) })));
        setSelectedProvider('freereels');
      }
    };
    fetchProviders();
  }, []);

  // Fetch Trending
  useEffect(() => {
    if (!selectedProvider) return;
    const fetchTrending = async () => {
      setIsLoadingTrending(true);
      try {
        const res = await fetch(`/api/rank/${selectedProvider}`);
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error("Trending fetch error raw text:", text);
          throw e;
        }
        if (Array.isArray(data)) setTrendingDramas(data);
        else if (data && Array.isArray(data.data)) setTrendingDramas(data.data);
        else if (data && Array.isArray(data.result)) setTrendingDramas(data.result);
        else setTrendingDramas([]);
      } catch (err) {
        console.error("Trending fetch error:", err);
        setTrendingDramas([]);
      } finally {
        setIsLoadingTrending(false);
      }
    };
    fetchTrending();
  }, [selectedProvider]);

  // 2. Search
  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !selectedProvider) return;
    
    setIsSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch(`/api/search/${selectedProvider}?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      
      if (Array.isArray(data)) {
        setSearchResults(data);
      } else if (data && Array.isArray(data.data)) {
        setSearchResults(data.data);
      } else if (data && Array.isArray(data.result)) {
        setSearchResults(data.result);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // 3. Select Drama -> Fetch Episodes
  const handleSelectDrama = async (drama: any) => {
    setSelectedDrama(drama);
    setView('details');
    setIsLoadingEpisodes(true);
    setEpisodes([]);
    
    // Save to history
    setHistory(prev => {
      const filtered = prev.filter(p => (p.id || p.title) !== (drama.id || drama.title));
      return [drama, ...filtered].slice(0, 20); // Keep last 20
    });
    
    // Attempt to get the ID
    const dramaId = drama.id || drama.link || drama.url || drama.fakeId || drama.videoFakeId;
    
    try {
      if (dramaId) {
        const res = await fetch(`/api/episodes/${selectedProvider}?id=${encodeURIComponent(dramaId)}`);
        const data = await res.json();
        
        let episodeList: any[] = [];
        if (Array.isArray(data)) episodeList = data;
        else if (data && Array.isArray(data.data)) episodeList = data.data;
        else if (data && data.data && typeof data.data === 'object') {
          // Handle object type where episodes are values (e.g. freereels)
          episodeList = Object.values(data.data);
        }
        else if (data && Array.isArray(data.episodes)) episodeList = data.episodes;
        
        // Final fallback: if no episodes returned but drama itself has episodes array
        if (episodeList.length === 0 && drama.episodes && Array.isArray(drama.episodes)) {
          episodeList = drama.episodes;
        }

        setEpisodes(episodeList);
      } else {
        // Fallback if API directly gives episodes in the drama object
        if (drama.episodes && Array.isArray(drama.episodes)) {
          setEpisodes(drama.episodes);
        }
      }
    } catch (err) {
      console.error("Episodes error:", err);
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  // 4. Select Episode -> Fetch Stream
  const handlePlayEpisode = async (episode: any) => {
    // Check limit first
    try {
       const deviceId = localStorage.getItem('deviceId') || ('uid_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
       localStorage.setItem('deviceId', deviceId);
       
       const trackRes = await fetch('/api/track', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ action: 'play', deviceId })
       });
       if (trackRes.ok) {
         const data = await trackRes.json();
         setLimitData(data);
         if (data.exceeded) {
           setShowLimitPopup(true);
           return;
         }
       }
    } catch(e) {}

    setView('player');
    setIsLoadingStream(true);
    setStreamData(null);
    setCurrentEpisode(episode);
    
    // Determine episode ID
    const epId = episode.videoFakeId || episode.id || episode.link || episode.url || episode.chapter_id;
    
    try {
      const deviceId = localStorage.getItem('deviceId') || '';
      const res = await fetch(`/api/stream/${selectedProvider}?id=${encodeURIComponent(epId)}&deviceId=${encodeURIComponent(deviceId)}`);
      if (!res.ok && res.status === 403) {
           setLimitData((prev: any) => ({ ...prev, exceeded: true }));
           setTimeout(() => setIsLimit(true), 100);
           setStreamData(null);
           return;
      }
      const data = await res.json();
      setStreamData(data);
    } catch (err) {
      console.error("Stream error:", err);
    } finally {
      setIsLoadingStream(false);
    }
  };

  const getCurrentEpisodeIndex = () => {
    if (!currentEpisode || episodes.length === 0) return -1;
    const epId = currentEpisode.videoFakeId || currentEpisode.id || currentEpisode.link || currentEpisode.url || currentEpisode.chapter_id;
    return episodes.findIndex(ep => {
      const id = ep.videoFakeId || ep.id || ep.link || ep.url || ep.chapter_id;
      return id === epId;
    });
  };

  const handleNextEpisode = () => {
    const currentIndex = getCurrentEpisodeIndex();
    if (currentIndex !== -1 && currentIndex < episodes.length - 1) {
      handlePlayEpisode(episodes[currentIndex + 1]);
    } else {
      setView('details');
    }
  };

  // UI Helpers
  const goBack = () => {
    if (view === 'player') setView('details');
    else if (view === 'details') setView('home');
    else if (view === 'categories' && selectedCategory) setSelectedCategory(null);
    else if (view === 'categories') setView('home');
  };

  // --- COMPUTE CATEGORIES ---
  const getCategoriesList = () => {
    const categoriesMap = new Map<string, number>();
    trendingDramas.forEach(drama => {
      const cats: string[] = [];
      if (drama.tags) cats.push(...drama.tags);
      if (drama.labels) cats.push(...drama.labels);
      if (drama.category) cats.push(drama.category);
      if (drama.type) cats.push(drama.type);
      
      const validCats = cats.filter(c => typeof c === 'string' && c.trim() !== '');
      
      if (validCats.length === 0) {
        categoriesMap.set('Umum', (categoriesMap.get('Umum') || 0) + 1);
      } else {
        validCats.forEach(c => {
          const key = c.trim();
          categoriesMap.set(key, (categoriesMap.get(key) || 0) + 1);
        });
      }
    });
    return Array.from(categoriesMap.entries()).sort((a, b) => b[1] - a[1]);
  };
  
  const categoriesList = getCategoriesList();
  const categoryDramas = selectedCategory 
    ? trendingDramas.filter(d => {
        const cats = [
          ...(d.tags || []), 
          ...(d.labels || []), 
          d.category, 
          d.type
        ].filter(c => typeof c === 'string' && c.trim() !== '').map(c => c.trim());
        
        if (selectedCategory === 'Umum') {
          return cats.length === 0;
        }
        return cats.includes(selectedCategory);
      })
    : [];

  // --- RENDERING ---

  // Helper to extract image
  const getImage = (item: any) => {
    return item.thumb || item.thumbnail || item.poster || item.cover || item.image || item.img || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
  };
  
  // Helper to extract title
  const getTitle = (item: any) => {
    return item.title || item.chapter_name || item.name || item.judul || (item.episode ? `Episode ${item.episode}` : undefined) || 'Unknown Title';
  };

  // Helper for episode title specifically
  const getEpisodeTitle = (ep: any, idx: number, parentDrama: any) => {
    if (ep.episodeNumber) return `Episode ${ep.episodeNumber}`;
    if (ep.episode) return `Episode ${ep.episode}`;
    
    const epTitle = getTitle(ep);
    const parentTitle = getTitle(parentDrama);
    
    if (!epTitle || epTitle === 'Unknown Title') return `Eps ${idx + 1}`;
    
    // If the episode title is exactly the same as the parent drama title, just return the episode number
    if (parentTitle && epTitle.toLowerCase() === parentTitle.toLowerCase()) {
      return `Eps ${idx + 1}`;
    }
    
    return epTitle;
  };

  // Helper to extract iframe or video URL
  const getStreamUrl = (data: any) => {
    if (!data) return null;
    
    let url = null;
    if (typeof data === 'string') url = data;
    else if (data.data?.streams && Array.isArray(data.data.streams) && data.data.streams[0]?.url) url = data.data.streams[0].url;
    else if (data.streams && Array.isArray(data.streams) && data.streams[0]?.url) url = data.streams[0].url;
    else if (data.data?.url) url = data.data.url;
    else if (data.data?.link) url = data.data.link;
    else if (data.data?.iframe) url = data.data.iframe;
    else if (data.url) url = data.url;
    else if (data.link) url = data.link;
    else if (data.file) url = data.file;
    else if (data.iframe) url = data.iframe;
    else if (Array.isArray(data) && data[0]?.url) url = data[0].url;
    else if (Array.isArray(data.data) && data.data[0]?.url) url = data.data[0].url;
    
    if (url) {
        return url;
    }

    // Fallback: Recursively look for a string starting with http and ending with m3u8/mp4, or just any http
    const _recursiveFindStr = (obj: any): string | null => {
      if (!obj || typeof obj !== 'object') return null;
      for (const val of Object.values(obj)) {
        if (typeof val === 'string' && val.startsWith('http') && (val.includes('.m3u8') || val.includes('.mp4'))) return val;
        if (typeof val === 'object') {
          const res = _recursiveFindStr(val);
          if (res) return res;
        }
      }
      return null;
    };
    
    const hlsUrl = _recursiveFindStr(data);
    if (hlsUrl) return hlsUrl;

    const maybeUrl = Object.values(data).find(v => typeof v === 'string' && v.startsWith('http'));
    return maybeUrl as string || null;
  };

  const isVideoFile = (url: string | null) => {
    if (!url) return false;
    return url.includes('.m3u8') || url.includes('.mp4') || url.includes('vividshort.com');
  };

  return (
    <div className="h-screen bg-[#0A0A0B] text-slate-200 flex overflow-hidden font-sans selection:bg-amber-500/30">
      {/* Sidebar Navigation */}
      <aside className="w-20 bg-[#121214] border-r border-white/5 flex-col items-center py-8 gap-10 hidden md:flex shrink-0">
        <div 
          onClick={() => setView('home')}
          className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer"
        >
          <span className="text-black font-black text-xl">P</span>
        </div>
        <nav className="flex flex-col gap-8 text-slate-500 items-center">
          <div onClick={() => setView('home')} className={`transition-colors cursor-pointer ${view === 'home' ? 'text-amber-500' : 'hover:text-amber-500'}`}><Tv className="w-6 h-6" /></div>
          <div className="hover:text-amber-500 transition-colors cursor-pointer"><Search className="w-6 h-6" /></div>
          <div className="hover:text-amber-500 transition-colors cursor-pointer"><Crown className="w-6 h-6" /></div>
          <div className="hover:text-amber-500 transition-colors cursor-pointer"><LayoutGrid className="w-6 h-6" /></div>
        </nav>
        <div className="mt-auto">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-slate-700 to-slate-500 border border-white/10"></div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden pb-16 md:pb-0">
        {/* Header */}
        <header className="h-16 md:h-20 shrink-0 flex items-center justify-between px-4 md:px-10 border-b border-white/5 bg-[#0A0A0B] z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white cursor-pointer flex items-center gap-2" onClick={() => setView('home')}>
              <span className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.3)] text-black font-black text-lg">P</span>
              PATUNGAN<span className="text-amber-500">TV</span>
            </h1>
            {view !== 'home' && (
              <button 
                onClick={goBack}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors bg-[#161618] px-2 py-1 rounded-full border border-white/5 ml-2"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
             <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-slate-700 to-slate-500 border border-white/10 cursor-pointer overflow-hidden">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Profile" className="w-full h-full object-cover" />
             </div>
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto no-scrollbar relative w-full">
          <AnimatePresence mode="wait">
            {view === 'home' && (
              <motion.div 
                key="home"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col w-full pb-20"
              >
                {/* Poster Carousel (Featured) */}
                {trendingDramas.length > 0 && !isSearching && !searchQuery && (
                   <div className="w-full overflow-x-auto flex gap-4 px-4 pt-0 pb-1 snap-x snap-mandatory no-scrollbar">
                     {trendingDramas.slice(0, 5).map((item, idx) => (
                       <div 
                         key={`hero-${item.id || idx}`}
                         onClick={() => handleSelectDrama(item)}
                         className="shrink-0 w-[94vw] md:w-[85vw] max-w-[600px] aspect-[4/5] sm:aspect-[16/9] md:aspect-[21/9] rounded-xl overflow-hidden relative snap-center cursor-pointer shadow-lg border border-white/5"
                       >
                         <img src={getImage(item)} alt={getTitle(item)} className="w-full h-full object-cover" />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4 md:p-6">
                           <h2 className="text-white text-lg md:text-xl font-bold line-clamp-2">{getTitle(item)}</h2>
                           <div className="flex gap-2 mt-2">
                             <span className="bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase">New</span>
                             {(item.quality || item.episode) && (
                               <span className="bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded">
                                 {item.quality || `${item.episode} Eps`}
                               </span>
                             )}
                           </div>
                         </div>
                       </div>
                     ))}
                   </div>
                )}

                {/* Search Bar */}
                <div className="px-4 mt-0">
                  <form onSubmit={handleSearch} className="relative w-full">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-slate-500" />
                    </div>
                    <input 
                      ref={searchInputRef}
                      type="text" 
                      placeholder="Cari video..."
                      className="w-full pl-10 pr-12 py-3 bg-[#1A1A1D] border border-white/5 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all text-white placeholder:text-slate-500 text-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button 
                      type="submit"
                      disabled={isSearching || !searchQuery}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-amber-600 text-black font-bold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center shrink-0 hover:bg-amber-500"
                    >
                      {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </button>
                  </form>
                </div>

                {/* Provider Selection Bar */}
                {providers.length > 0 && (
                  <div className="px-4 mt-0">
                    <div className="flex overflow-x-auto no-scrollbar gap-2 items-center pb-1 pt-1">
                      {providers.map((p, i) => {
                        const val = p.id || p.name || p;
                        const name = p.name || p.id || p;
                        const display = typeof name === 'string' ? name.toUpperCase() : val;
                        const isActive = selectedProvider === val;
                        return (
                          <button
                            key={val + i}
                            onClick={() => setSelectedProvider(val)}
                            className={`shrink-0 px-5 py-2.5 rounded-xl font-bold text-[10px] sm:text-xs tracking-wider transition-all border ${
                              isActive 
                                ? 'bg-amber-500 text-black border-amber-500 shadow-[0_4px_15px_rgba(245,158,11,0.2)]' 
                                : 'bg-[#161618] text-slate-400 border-white/5 hover:border-white/20'
                            }`}
                          >
                            {display}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Video Lists / Categories */}
                <div className="mt-0">
                  {searchResults.length > 0 ? (
                    <div className="px-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-bold text-white tracking-tight">Hasil Pencarian</h3>
                      </div>
                      <div className="flex overflow-x-auto no-scrollbar gap-3 pb-2 snap-x">
                        {searchResults.map((item, idx) => (
                          <div
                            key={`search-${item.id || item.videoFakeId || idx}-${idx}`}
                            onClick={() => handleSelectDrama(item)}
                            className="shrink-0 w-36 md:w-48 snap-start group relative rounded-xl overflow-hidden cursor-pointer bg-[#161618] border border-white/5 hover:border-amber-500/50 transition-all shadow-md"
                          >
                            <div className="aspect-[2/3] overflow-hidden relative">
                              <img src={getImage(item)} alt={getTitle(item)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                                <div className="w-10 h-10 rounded-full bg-amber-500 text-black flex items-center justify-center">
                                  <Play className="w-4 h-4 ml-1" />
                                </div>
                              </div>
                              <div className="absolute top-2 left-2 flex gap-1">
                                 {(item.type || item.category) && (
                                   <span className="bg-black/60 backdrop-blur-md text-amber-500 border border-white/10 text-[8px] font-bold px-1.5 py-0.5 rounded capitalize">
                                     {item.category || item.type}
                                   </span>
                                 )}
                              </div>
                            </div>
                            <div className="p-3">
                              <h4 className="font-bold text-white text-[11px] leading-snug line-clamp-2">{getTitle(item)}</h4>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : !isSearching && searchQuery ? (
                    <div className="px-4 text-center py-6 text-slate-500 border border-white/5 rounded-xl bg-[#121214]">
                      <Popcorn className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Tidak ada hasil ditemukan.</p>
                    </div>
                  ) : isLoadingTrending ? (
                    <div className="flex justify-center py-6 text-amber-500">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : trendingDramas.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {[
                        { title: "Terbaru", offset: 0 },
                        { title: "Terpopuler", offset: 2 },
                        { title: "Family", offset: 4 },
                        { title: "Aksi", offset: 6 },
                        { title: "Fantasy", offset: 8 },
                        { title: "Romance", offset: 10 }
                      ].map((cat, i) => {
                        // Cyclic slice to ensure enough items in each category
                        const safeOffset = cat.offset % trendingDramas.length;
                        const items = trendingDramas.slice(safeOffset).concat(trendingDramas.slice(0, safeOffset)).slice(0, 10);
                        
                        if (items.length === 0) return null;
                        
                        return (
                          <div key={cat.title} className="px-4">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-sm font-bold text-white tracking-tight">{i + 1}. {cat.title}</h3>
                            </div>
                            <div className="flex overflow-x-auto no-scrollbar gap-3 pb-2 snap-x">
                              {items.map((item, idx) => (
                                <div
                                  key={`cat-${cat.title}-${item.id || item.videoFakeId || idx}-${idx}`}
                                  onClick={() => handleSelectDrama(item)}
                                  className="shrink-0 w-32 md:w-40 snap-start group relative rounded-xl overflow-hidden cursor-pointer bg-[#161618] border border-white/5 hover:border-amber-500/50 transition-all shadow-md"
                                >
                                  <div className="aspect-[2/3] overflow-hidden relative">
                                    <img src={getImage(item)} alt={getTitle(item)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                                      <div className="w-10 h-10 rounded-full bg-amber-500 text-black flex items-center justify-center">
                                        <Play className="w-4 h-4 ml-1" />
                                      </div>
                                    </div>
                                    <div className="absolute top-2 left-2 flex gap-1 flex-wrap pr-2">
                                       {(item.type || item.category || cat.title) && (
                                         <span className="bg-black/60 backdrop-blur-md text-amber-500 border border-white/10 text-[8px] font-bold px-1.5 py-0.5 rounded capitalize">
                                           {item.category || item.type || cat.title}
                                         </span>
                                       )}
                                    </div>
                                  </div>
                                  <div className="p-2">
                                    <h4 className="font-bold text-white text-[10px] leading-snug line-clamp-2 group-hover:text-amber-500 transition-colors">{getTitle(item)}</h4>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 text-center py-6 text-slate-500 border border-white/5 rounded-xl bg-[#121214]">
                      <Popcorn className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Koleksi belum tersedia.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === 'details' && selectedDrama && (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full mx-auto space-y-4 pb-20 p-2 md:p-8"
              >
                {/* Drama Hero Info */}
                <div className="w-full relative rounded-2xl overflow-hidden shadow-lg bg-[#121214] border border-white/5 aspect-[16/10] md:aspect-video flex items-center justify-center group cursor-pointer" onClick={() => episodes.length > 0 && handlePlayEpisode(episodes[0])}>
                  <img src={getImage(selectedDrama)} alt={getTitle(selectedDrama)} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-transparent to-transparent" />
                  <div className="z-10 bg-amber-500 text-black w-14 h-14 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)] group-hover:scale-110 transition-transform">
                     <Play className="w-7 h-7 ml-1 fill-current" />
                  </div>
                  <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                    <div>
                      <div className="flex gap-2 mb-2">
                        <span className="bg-amber-500 text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase">Drama</span>
                        {selectedDrama.quality && (
                          <span className="bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">{selectedDrama.quality}</span>
                        )}
                      </div>
                      <h1 className="text-xl md:text-3xl font-black text-white leading-tight line-clamp-2">{getTitle(selectedDrama)}</h1>
                    </div>
                  </div>
                </div>

                {/* Description Box */}
                <div className="bg-[#121214] rounded-2xl border border-white/5 p-4 flex justify-between items-center">
                  <div className="flex-1">
                     <h3 className="font-bold text-white text-sm">Keterangan Video</h3>
                     <p className="text-xs text-slate-400 mt-1 line-clamp-2">{selectedDrama.description || "Tonton drama " + getTitle(selectedDrama) + " dengan kualitas terbaik."}</p>
                  </div>
                  <button className="flex flex-col items-center gap-1 bg-[#1A1A1D] border border-white/10 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-[#2A2A2D] transition-colors shrink-0 ml-4">
                    <Crown className="w-4 h-4 text-amber-500" /> Fav
                  </button>
                </div>

                {/* Episodes Section */}
                <div className="bg-[#121214] rounded-2xl border border-white/5 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <LayoutGrid className="w-5 h-5 text-amber-500" />
                      <h2 className="text-sm font-bold text-white tracking-tight">Daftar Episode</h2>
                    </div>
                    {episodes.length > 0 && (
                      <span className="text-[10px] font-medium text-slate-500 tracking-wider bg-[#1A1A1D] px-2 py-1 rounded-md">{episodes.length} Eps</span>
                    )}
                  </div>
                  
                  {isLoadingEpisodes ? (
                    <div className="flex items-center justify-center gap-3 text-amber-500 py-10">
                      <Loader2 className="w-5 h-5 animate-spin" /> 
                    </div>
                  ) : episodes.length > 0 ? (
                    <div className="w-full overflow-x-auto no-scrollbar pb-2">
                      <div className="grid grid-rows-5 grid-flow-col gap-2 w-max">
                        {episodes.map((ep, idx) => {
                          const displayTitle = getEpisodeTitle(ep, idx, selectedDrama);
                          const epId = ep.id || ep.videoFakeId || ep.link || ep.url || ep.chapter_id;
                          const currentEpId = currentEpisode?.id || currentEpisode?.videoFakeId || currentEpisode?.link || currentEpisode?.url || currentEpisode?.chapter_id;
                          const isCurrent = currentEpisode && epId === currentEpId;
                          
                          return (
                            <button
                              key={`ep-${epId || idx}-${idx}`}
                              onClick={() => handlePlayEpisode(ep)}
                              className={`border px-4 py-2 rounded-xl flex items-center justify-center transition-all text-center min-w-[100px] ${
                                isCurrent 
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-500 hover:bg-amber-500/30' 
                                  : 'bg-[#1A1A1D] border-white/5 hover:border-amber-500/50 hover:bg-[#2A2A2D]'
                              }`}
                            >
                              <span className={`text-xs font-bold transition-colors ${
                                isCurrent ? 'text-amber-500' : 'text-slate-300 hover:text-white'
                              }`}>{displayTitle}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-[#1A1A1D] rounded-xl border border-white/5">
                      <p className="text-slate-500 italic text-sm">Episode tidak tersedia dari provider.</p>
                      {selectedProvider === 'netshort' && (
                        <p className="text-xs text-red-500/70 mt-2">API Netshort saat ini sedang tidak mengembalikan daftar episode.</p>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {view === 'categories' && (
              <motion.div
                key="categories"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full mx-auto pb-20 px-4 py-4 space-y-4"
              >
                {!selectedCategory ? (
                  <>
                    <h2 className="text-xl font-bold text-white mb-2">Kategori</h2>
                    
                    {/* Provider Selection */}
                    {providers.length > 0 && (
                      <div className="flex overflow-x-auto no-scrollbar gap-2 items-center mb-4 pb-2">
                        {providers.map((p, i) => {
                          const val = p.id || p.name || p;
                          const name = p.name || p.id || p;
                          const display = typeof name === 'string' ? name.toUpperCase() : val;
                          const isActive = selectedProvider === val;
                          return (
                            <button
                              key={`cat-prov-${val}-${i}`}
                              onClick={() => setSelectedProvider(val)}
                              className={`shrink-0 px-4 py-2 rounded-xl font-bold text-[10px] sm:text-xs tracking-wider transition-all border ${
                                isActive 
                                  ? 'bg-amber-500 text-black border-amber-500 shadow-[0_4px_15px_rgba(245,158,11,0.2)]' 
                                  : 'bg-[#161618] text-slate-400 border-white/5 hover:border-white/20'
                              }`}
                            >
                              {display}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {isLoadingTrending ? (
                      <div className="flex justify-center py-10 text-amber-500">
                        <Loader2 className="w-8 h-8 animate-spin" />
                      </div>
                    ) : categoriesList.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {categoriesList.map(([cat, count]) => (
                          <div 
                            key={cat} 
                            onClick={() => setSelectedCategory(cat)}
                            className="bg-[#121214] border border-white/5 hover:border-amber-500/50 p-4 rounded-xl cursor-pointer flex flex-col items-center justify-center text-center transition-all group"
                          >
                            <span className="text-white font-bold text-sm mb-1 group-hover:text-amber-500 transition-colors">{cat}</span>
                            <span className="text-slate-500 text-[10px] bg-black/30 px-2 py-0.5 rounded-full">{count} Video</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-20 text-slate-500 bg-[#121214] rounded-2xl border border-white/5">
                        <p>Tidak ada kategori untuk provider ini.</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => setSelectedCategory(null)} className="p-1 bg-[#1A1A1D] rounded-full border border-white/10 text-slate-400 hover:text-white transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <h2 className="text-xl font-bold text-white capitalize">{selectedCategory}</h2>
                      <span className="ml-auto text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded">{categoryDramas.length} Video</span>
                    </div>
                    
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                      {categoryDramas.map((item, idx) => (
                        <div
                          key={`cat-drama-${item.id || item.videoFakeId || idx}-${idx}`}
                          onClick={() => handleSelectDrama(item)}
                          className="group relative rounded-xl overflow-hidden cursor-pointer bg-[#161618] border border-white/5 hover:border-amber-500/50 transition-all shadow-md aspect-[2/3]"
                        >
                          <img src={getImage(item)} alt={getTitle(item)} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/40">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-lg">
                              <Play className="w-4 h-4 ml-1" />
                            </div>
                          </div>
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-2 md:p-3 pt-6">
                            <h4 className="font-bold text-white text-[10px] md:text-[11px] leading-tight line-clamp-2">{getTitle(item)}</h4>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {view === 'history' && (
              <motion.div 
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="w-full mx-auto pb-20 px-4 py-6"
              >
                <div className="flex items-center gap-2 mb-6">
                  <Crown className="w-6 h-6 text-amber-500" />
                  <h2 className="text-xl font-bold text-white">Riwayat Tontonan</h2>
                </div>

                {history.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {history.map((item, idx) => (
                      <div 
                        key={`hist-${item.id || item.videoFakeId || idx}-${idx}`}
                        className="flex gap-4 p-3 bg-[#121214] border border-white/5 rounded-xl cursor-pointer hover:border-amber-500/50 transition-colors"
                        onClick={() => handleSelectDrama(item)}
                      >
                        <div className="w-24 aspect-[2/3] md:aspect-video rounded-lg overflow-hidden shrink-0 relative">
                          <img src={getImage(item)} alt={getTitle(item)} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <Play className="w-6 h-6 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <h4 className="font-bold text-white text-sm line-clamp-2">{getTitle(item)}</h4>
                          <div className="flex items-center gap-2 mt-2">
                             {(item.type || item.category) && (
                               <span className="bg-amber-500 text-black px-1.5 py-0.5 rounded text-[10px] font-bold uppercase">{item.category || item.type}</span>
                             )}
                             <span className="text-slate-500 text-[10px]">Pernah ditonton</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 text-slate-500 bg-[#121214] rounded-2xl border border-white/5 flex flex-col items-center">
                    <Popcorn className="w-12 h-12 mb-4 opacity-30" />
                    <p>Belum ada riwayat tontonan.</p>
                  </div>
                )}
              </motion.div>
            )}

            {view === 'player' && (
              <motion.div
                key="player"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full flex flex-col h-full bg-black z-50 absolute inset-0"
              >
                <div 
                  className={`flex items-center justify-between p-3 absolute top-0 w-full z-10 transition-opacity duration-300 pointer-events-none pt-4 ${showPlayerUI ? 'opacity-100' : 'opacity-0'}`}
                >
                  <div className="pointer-events-auto">
                    <button 
                      onClick={() => setView('details')}
                      className="flex items-center justify-center w-8 h-8 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-colors shrink-0"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="pointer-events-auto">
                    {getCurrentEpisodeIndex() !== -1 && getCurrentEpisodeIndex() < episodes.length - 1 && (
                      <button
                        onClick={handleNextEpisode}
                        className="flex items-center justify-center px-4 py-2 bg-amber-500 text-black text-[11px] font-bold rounded-full shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:bg-amber-400 transition-colors shrink-0"
                      >
                        Berikutnya
                      </button>
                    )}
                  </div>
                </div>
                
                <div 
                  className="flex-1 w-full flex items-center justify-center relative" 
                  onClick={resetPlayerUiTimer} 
                  onTouchStart={resetPlayerUiTimer}
                >
                  {isLoadingStream ? (
                    <div className="flex flex-col items-center gap-2 text-amber-500">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <span className="text-white font-bold text-xs">Memuat...</span>
                    </div>
                  ) : getStreamUrl(streamData) ? (
                    isVideoFile(getStreamUrl(streamData)) ? (
                      getStreamUrl(streamData)?.includes('.m3u8') ? (
                        <HlsPlayer 
                          key={getStreamUrl(streamData)!}
                          src={getStreamUrl(streamData)!}
                          className="w-full h-full object-contain"
                          onEnded={handleNextEpisode}
                        />
                      ) : (
                        <video 
                          key={getStreamUrl(streamData)!}
                          src={getStreamUrl(streamData)!}
                          controls
                          playsInline
                          className="w-full h-full object-contain"
                          onEnded={handleNextEpisode}
                        />
                      )
                    ) : (
                      <iframe 
                        src={getStreamUrl(streamData)!} 
                        className="w-full h-full border-0"
                        allowFullScreen
                        allow="autoplay; fullscreen"
                      />
                    )
                  ) : (
                    <div className="text-slate-500 text-center space-y-4 p-6">
                      <span className="text-4xl">🎬</span>
                      <p className="font-bold text-white">Stream tidak tersedia.</p>
                      <button 
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-amber-500 text-black font-bold rounded-xl text-sm"
                      >
                        Muat Ulang
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            {view === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-xl mx-auto pb-20 px-4 pt-4"
              >
                <div className="bg-[#161618] border border-white/5 p-6 rounded-2xl mb-6 flex flex-col items-center">
                  <div className="w-24 h-24 rounded-2xl overflow-hidden mb-4 border-2 border-amber-500 p-1">
                    <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Profile" className="w-full h-full object-cover rounded-xl bg-[#1A1A1D]" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    <span className="text-amber-500">{limitData?.user?.limit > 100 ? 'PRO' : 'FREE'}</span> User
                  </h3>
                  <div className="flex gap-2 text-xs font-bold mt-2">
                    <span className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/20">Aktif</span>
                  </div>
                </div>

                <div className="bg-[#161618] border border-white/5 rounded-2xl divide-y divide-white/5 mb-6">
                   <div className="flex justify-between items-center p-4">
                     <div className="flex items-center gap-3 text-slate-400">
                       <Key className="w-5 h-5" />
                       <span className="font-bold text-sm">Status Akun</span>
                     </div>
                     <span className="text-white font-bold text-sm uppercase">{limitData?.user?.limit > 100 ? 'PRO' : 'FREE'}</span>
                   </div>
                   <div className="flex justify-between items-center p-4">
                     <div className="flex items-center gap-3 text-slate-400">
                       <Crown className="w-5 h-5 text-amber-500" />
                       <span className="font-bold text-sm">Limit</span>
                     </div>
                     <span className="text-amber-500 font-bold text-sm">
                       {limitData ? (
                         limitData.user?.limit > 1000 
                          ? 'Unlimited' 
                          : `${Math.max(0, limitData.user?.limit - limitData.user?.dataLimit)} Sisa`
                       ) : 'Loading...'}
                     </span>
                   </div>
                   <div className="flex justify-between items-center p-4">
                     <div className="flex items-center gap-3 text-slate-400">
                       <Globe className="w-5 h-5 text-blue-400" />
                       <span className="font-bold text-sm">IP Address</span>
                     </div>
                     <span className="text-white font-mono text-xs opacity-70 break-all text-right">{profileData.ip}</span>
                   </div>
                   <div className="flex justify-between items-center p-4">
                     <div className="flex items-center gap-3 text-slate-400 shrink-0">
                       <Smartphone className="w-5 h-5 text-pink-400" />
                       <span className="font-bold text-sm">User Agent</span>
                     </div>
                     <span className="text-white font-mono text-xs opacity-70 flex-1 text-right ml-4 line-clamp-2 max-w-[200px] break-all">{profileData.userAgent}</span>
                   </div>
                </div>

                {/* QR Code Placeholder */}
                <div className="bg-[#161618] border border-white/5 rounded-2xl p-6 mb-6 flex flex-col items-center justify-center">
                  <h4 className="text-white font-bold mb-4 flex items-center gap-2"><QrCode className="w-5 h-5 text-amber-500"/> QR Akses Khusus</h4>
                  <div className="w-full bg-white p-4 rounded-xl flex items-center justify-center">
                    <img src={limitData?.qrImage || "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=example_qr"} alt="QR" className="w-full h-auto" />
                  </div>
                  <p className="text-xs text-slate-500 text-center mt-4 text-amber-500/80">Silakan scan kode QR ini untuk info lebih lanjut atau upgrade akun.</p>
                </div>

                {/* Contacts */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                   <a href="https://wa.me/message/KKWFQGRAAWSKH1" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#1A3324] text-[#25D366] hover:bg-[#1f422d] py-3 rounded-xl border border-[#25D366] transition-colors">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" /><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1Z" /><path d="M14 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1Z" /><path d="M9.5 13.5c.5 1 1.5 1 2.5 1s2-.5 2.5-1" /></svg>
                     <span className="font-bold text-xs">WhatsApp</span>
                   </a>
                   <a href="https://t.me/otomotif_digital" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#122A3B] text-[#0088cc] hover:bg-[#18354c] py-3 rounded-xl border border-[#0088cc] transition-colors">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                     <span className="font-bold text-xs">Telegram</span>
                   </a>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed sm:relative bottom-0 w-full h-16 bg-[#0A0A0B] border-t border-white/5 flex items-center justify-around px-2 z-40 pb-safe">
          <button onClick={() => { setView('home'); setSearchQuery(''); setSearchResults([]); }} className={`flex flex-col items-center gap-1 ${view === 'home' ? 'text-amber-500' : 'text-slate-500'}`}>
             <Tv className="w-5 h-5" />
             <span className="text-[10px] font-bold">Beranda</span>
          </button>
          <button onClick={() => { setView('categories'); setSelectedCategory(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={`flex flex-col items-center gap-1 hover:text-amber-500 ${view === 'categories' ? 'text-amber-500' : 'text-slate-500'}`}>
             <LayoutGrid className="w-5 h-5" />
             <span className="text-[10px] font-bold">Kategori</span>
          </button>
          <button onClick={() => { setView('home'); searchInputRef.current?.focus(); }} className="flex flex-col items-center gap-1 text-slate-500 hover:text-amber-500">
             <Search className="w-5 h-5" />
             <span className="text-[10px] font-bold">Cari</span>
          </button>
          <button onClick={() => setView('history')} className={`flex flex-col items-center gap-1 ${view === 'history' ? 'text-amber-500' : 'text-slate-500'}`}>
             <Crown className="w-5 h-5" />
             <span className="text-[10px] font-bold">Riwayat</span>
          </button>
          <button onClick={() => setView('profile')} className={`flex flex-col items-center gap-1 hover:text-amber-500 ${view === 'profile' ? 'text-amber-500' : 'text-slate-500'}`}>
             <div className={`w-5 h-5 rounded-md overflow-hidden ${view === 'profile' ? 'ring-2 ring-amber-500 ring-offset-1 ring-offset-[#0A0A0B]' : ''}`}>
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Profile" className="w-full h-full object-cover" />
             </div>
             <span className="text-[10px] font-bold">Profil</span>
          </button>
        </div>
        
        {/* Limit Exceeded Popup */}
        <AnimatePresence>
          {showLimitPopup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-[#161618] border border-amber-500/30 rounded-2xl p-6 max-w-sm w-full relative"
              >
                <button onClick={() => setShowLimitPopup(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-white/5 rounded-full p-2">
                  <X className="w-5 h-5" />
                </button>
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
                    <Crown className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Limit Habis</h3>
                  <p className="text-amber-500/90 text-sm leading-relaxed mb-6">
                    {limitData?.popupText || "Mohon maaf limit menonton Anda sudah habis, harap upgrade ke VIP untuk menikmati semua tayangan tanpa batas."}
                  </p>
                  
                  {limitData?.qrImage && (
                    <div className="bg-white p-4 rounded-xl mb-6 mx-auto w-full">
                      <img src={limitData.qrImage} alt="QR Code" className="w-full h-auto" />
                    </div>
                  )}

                  <div className="w-full space-y-3">
                     <a href="https://wa.me/message/KKWFQGRAAWSKH1" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold py-3 px-4 rounded-xl hover:bg-[#20bd5a] transition-all border-none">
                       <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" /><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1Z" /><path d="M14 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1Z" /><path d="M9.5 13.5c.5 1 1.5 1 2.5 1s2-.5 2.5-1" /></svg>
                       <span className="font-bold">Hubungi WhatsApp</span>
                     </a>
                     <a href="https://t.me/otomotif_digital" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-[#0088cc] text-white font-bold py-3 px-4 rounded-xl hover:bg-[#007ab8] transition-all border-none">
                       <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>
                       <span className="font-bold">Hubungi Telegram</span>
                     </a>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
