import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Settings, Users, Key, Trash2, Save, LogOut, Search, Activity, Edit2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Admin() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<any>(null);
  
  // Forms
  const [popupText, setPopupText] = useState('');
  const [qrImage, setQrImage] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const navigate = useNavigate();

  const loadConfig = async (authPass: string) => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/config', {
        headers: { 'x-admin-password': authPass }
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setPopupText(data.popupText || '');
        setQrImage(data.qrImage || '');
        setApiKey(data.apiKey || '');
        setAuthenticated(true);
      } else {
        alert('Kata sandi salah');
      }
    } catch (e) {
      alert('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loadConfig(password);
  };

  const handleSaveConfig = async () => {
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({ popupText, qrImage, apiKey })
      });
      if (res.ok) {
        alert('Pengaturan berhasil disimpan');
        loadConfig(password);
      }
    } catch (e) {
      alert('Gagal menyimpan pengaturan');
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPassword) return;
    try {
      const res = await fetch('/api/admin/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({ newPassword })
      });
      if (res.ok) {
        alert('Kata sandi berhasil diubah. Silahkan login kembali.');
        setPassword('');
        setNewPassword('');
        setAuthenticated(false);
      }
    } catch (e) {
      alert('Gagal mengubah kata sandi');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Yakin ingin menghapus user ini?')) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-password': password
        }
      });
      if (res.ok) {
        loadConfig(password);
      }
    } catch (e) {
      alert('Gagal menghapus user');
    }
  };

  const handleUpdateLimit = async (id: string, currentLimit: number) => {
    const lim = prompt('Masukkan limit baru (ketik angka saja)', currentLimit.toString());
    if (lim && !isNaN(Number(lim))) {
      try {
        const res = await fetch(`/api/admin/users/${id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-password': password
          },
          body: JSON.stringify({ limit: Number(lim) })
        });
        if (res.ok) {
          loadConfig(password);
        }
      } catch (e) {
        alert('Gagal mengupdate limit user');
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setQrImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#161618] border border-white/5 p-8 rounded-2xl w-full max-w-sm">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20">
              <Settings className="w-8 h-8 text-amber-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-6">Admin Panel</h1>
          <form onSubmit={handleLogin} className="space-y-4">
             <div>
                <label className="text-xs font-bold text-slate-400 mb-1 block">Kata Sandi</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
                  placeholder="Masukkan kata sandi admin"
                />
             </div>
             <button disabled={loading} className="w-full bg-amber-500 text-black font-bold py-3 rounded-xl hover:bg-amber-400 transition-colors">
               {loading ? 'Memeriksa...' : 'Masuk'}
             </button>
             <button type="button" onClick={() => navigate('/')} className="w-full text-slate-500 font-bold py-3 hover:text-white transition-colors text-xs">
               Kembali ke Beranda
             </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Active users count (active in last 5 minutes)
  const activeUsers = config?.users.filter((u: any) => new Date(u.lastActive).getTime() > Date.now() - 5 * 60 * 1000).length || 0;

  return (
    <div className="min-h-screen bg-[#0A0A0B] pb-20">
      {/* Header */}
      <div className="bg-[#121214] border-b border-white/5 px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 text-black p-2 rounded-xl">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white leading-tight">Admin Dashboard</h1>
            <p className="text-xs font-medium text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {activeUsers} User Aktif
            </p>
          </div>
        </div>
        <button onClick={() => navigate('/')} className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-bold bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
           <LogOut className="w-4 h-4" /> <span className="hidden md:inline">Keluar</span>
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col - Settings */}
        <div className="space-y-6">
          <div className="bg-[#161618] rounded-2xl border border-white/5 p-5">
             <h2 className="text-white font-bold mb-4 flex items-center gap-2">
               <Activity className="w-4 h-4 text-amber-500" /> Pengaturan Limit & Popup
             </h2>
             <div className="space-y-4">
               <div>
                 <label className="text-xs font-bold text-slate-400 mb-1 block">Teks Popup saat limit habis</label>
                 <textarea 
                   rows={4}
                   value={popupText}
                   onChange={e => setPopupText(e.target.value)}
                   className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 resize-none leading-relaxed"
                 />
               </div>
               <div>
                 <label className="text-xs font-bold text-slate-400 mb-1 block">QR Code (Upload/Base64/URL)</label>
                 <input type="file" accept="image/*" onChange={handleImageUpload} className="mb-2 block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-amber-500 file:text-black hover:file:bg-amber-400" />
                 <input 
                   type="text" 
                   value={qrImage}
                   onChange={e => setQrImage(e.target.value)}
                   placeholder="Atau paste URL gambar QR disini"
                   className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                 />
                 {qrImage && (
                   <div className="mt-3 bg-white p-2 w-32 h-32 rounded-xl border border-slate-600">
                     <img src={qrImage} alt="QR Code Preview" className="w-full h-full object-contain" />
                   </div>
                 )}
               </div>
               <div>
                 <label className="text-xs font-bold text-slate-400 mb-1 block">API Key (Disimpan di R2)</label>
                 <input 
                   type="text" 
                   value={apiKey}
                   onChange={e => setApiKey(e.target.value)}
                   className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500 mb-4"
                   placeholder="Masukkan API Key yang baru"
                 />
               </div>
               <button onClick={handleSaveConfig} className="w-full flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-colors border border-white/10">
                 <Save className="w-4 h-4" /> Simpan Pengaturan
               </button>
             </div>
          </div>

          <div className="bg-[#161618] rounded-2xl border border-white/5 p-5">
             <h2 className="text-white font-bold mb-4 flex items-center gap-2">
               <Key className="w-4 h-4 text-amber-500" /> Ganti Kata Sandi Admin
             </h2>
             <div className="space-y-4">
                <input 
                  type="password" 
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Kata Sandi Baru"
                  className="w-full bg-[#1A1A1D] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500"
                />
                <button onClick={handleUpdatePassword} className="w-full bg-red-500/10 text-red-500 hover:bg-red-500/20 font-bold py-3 rounded-xl transition-colors border border-red-500/20">
                  Ubah Kata Sandi
                </button>
             </div>
          </div>
        </div>

        {/* Right Col - Users */}
        <div className="lg:col-span-2 space-y-4">
           <div className="flex items-center justify-between mb-2">
             <h2 className="text-lg font-bold text-white flex items-center gap-2">
               <Users className="w-5 h-5 text-amber-500" /> Daftar Pengguna
             </h2>
             <div className="text-xs font-bold bg-[#161618] border border-white/5 px-4 py-2 rounded-xl text-slate-400">
               Total: {config?.users?.length || 0}
             </div>
           </div>
           
           <div className="grid gap-3">
             {config?.users && config.users.length > 0 ? [...config.users].reverse().map((u: any) => (
                <div key={u.id} className="bg-[#161618] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="space-y-1 w-full sm:w-auto">
                    <div className="flex items-center gap-2">
                       <span className="font-mono text-sm font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">{u.ip}</span>
                       <span className="text-[10px] text-slate-500 font-medium">{new Date(u.lastActive).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1 max-w-sm" title={u.userAgent}>{u.userAgent}</p>
                  </div>
                  
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                     <div className="flex items-center gap-2 bg-[#1A1A1D] border border-white/5 px-3 py-1.5 rounded-lg">
                        <div className="flex flex-col items-center">
                           <span className="text-[10px] text-slate-500 font-bold">Terpakai</span>
                           <span className={`text-sm font-bold ${u.dataLimit >= u.limit ? 'text-red-500' : 'text-emerald-500'}`}>{u.dataLimit}</span>
                        </div>
                        <span className="text-slate-600">/</span>
                        <div className="flex flex-col items-center">
                           <span className="text-[10px] text-slate-500 font-bold">Limit</span>
                           <span className="text-sm font-bold text-white">{u.limit}</span>
                        </div>
                        <button onClick={() => handleUpdateLimit(u.id, u.limit)} className="ml-2 text-slate-400 hover:text-amber-500 p-1">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                     </div>
                     <button onClick={() => handleDeleteUser(u.id)} className="bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white p-2.5 rounded-xl border border-red-500/20 hover:border-red-500 transition-all">
                       <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
                </div>
             )) : (
               <div className="text-center py-10 bg-[#161618] rounded-2xl border border-white/5">
                 <p className="text-slate-500 text-sm font-bold">Belum ada user yang tercatat.</p>
               </div>
             )}
           </div>
        </div>

      </div>
    </div>
  );
}
