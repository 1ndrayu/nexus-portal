"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, googleProvider } from "@/lib/firebase";
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  onAuthStateChanged,
  signInAnonymously
} from "firebase/auth";
import { 
  ShieldCheck, Mail, Lock, Globe, 
  Shield, Fingerprint, LogIn, ChevronRight,
  AlertCircle
} from "lucide-react";

const NexusLogo = ({ className = "h-8 w-8" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M25 80V20L75 80V20" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) router.push("/dashboard");
    });
    return () => unsubscribe();
  }, [router]);

  const isMockConfig = auth.app.options.apiKey === "mock-api-key";

  const handleDemoLogin = () => {
    // Local demo bypass
    router.push("/dashboard");
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (isMockConfig) {
      if ((email === "admin@nexus.io" || email === "admin") && (password === "nexus2026" || password === "admin")) {
        router.push("/dashboard");
        return;
      } else {
        setError("Demo Mode: Use admin / admin");
        setLoading(false);
        return;
      }
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err: any) {
      const error = err as { code?: string; message?: string };
      if (error.code === "auth/api-key-not-valid") {
        setError("System Configuration Error: Invalid Firebase API Key. Please check your .env file.");
      } else {
        setError(error.message || "An unexpected error occurred");
      }
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isMockConfig) {
      handleDemoLogin();
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
      router.push("/dashboard");
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Google authentication failed");
      setLoading(false);
    }
  };

  const handleAnonymousLogin = async () => {
    if (isMockConfig) {
      handleDemoLogin();
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signInAnonymously(auth);
      router.push("/dashboard");
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Anonymous login failed");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-50 rounded-full blur-[120px] opacity-50"></div>
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-50 rounded-full blur-[100px] opacity-40"></div>

      <section className="w-full max-w-lg bg-white rounded-[3rem] p-12 border border-gray-100 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <header className="flex flex-col items-center mb-12">
          <div className="h-20 w-20 bg-blue-600 text-white rounded-[2rem] flex items-center justify-center shadow-2xl shadow-blue-200 mb-8 group hover:scale-105 transition-transform duration-500">
             <NexusLogo className="h-10 w-10" />
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">Nexus</h1>
          <div className="flex flex-col items-center space-y-2 mt-3">
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.3em] bg-blue-50 px-4 py-1.5 rounded-full">Modular Authentication</p>
            {isMockConfig && (
              <div className="flex items-center space-x-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100">
                 <AlertCircle size={12} />
                 <span>DEMO MODE ACTIVE</span>
              </div>
            )}
          </div>
        </header>

        <div className="space-y-4">
          {/* Primary Login: Google */}
          <button 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white border-2 border-gray-100 text-gray-900 font-bold py-5 rounded-[1.5rem] hover:border-blue-400 hover:bg-blue-50/30 transition-all flex items-center justify-between px-8 group relative overflow-hidden active:scale-[0.98] disabled:opacity-50"
          >
            <div className="flex items-center space-x-4 relative z-10">
               <div className="bg-blue-50 p-2.5 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Globe size={20} className="text-blue-600 group-hover:text-white" />
               </div>
               <span className="uppercase tracking-widest text-xs">Continue with Global ID</span>
            </div>
            <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-600 transition-colors relative z-10" />
            <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </button>

          {/* Secondary Login: Anonymous */}
          <button 
            onClick={handleAnonymousLogin}
            disabled={loading}
            className="w-full bg-gray-900 text-white font-bold py-5 rounded-[1.5rem] hover:bg-gray-800 transition-all flex items-center justify-between px-8 group active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-gray-200"
          >
            <div className="flex items-center space-x-4">
               <div className="bg-white/10 p-2.5 rounded-xl group-hover:bg-blue-600 transition-colors">
                  <Fingerprint size={20} className="text-white" />
               </div>
               <span className="uppercase tracking-widest text-xs">Quick Access (Anonymous)</span>
            </div>
            <ChevronRight size={18} className="text-gray-500 group-hover:text-white transition-colors" />
          </button>
        </div>

        {error && (
          <div className="mt-8 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center space-x-3 text-red-600 animate-in shake-in">
             <Shield className="shrink-0" size={18} />
             <p className="text-xs font-bold uppercase tracking-tight">{error}</p>
          </div>
        )}

        <div className="relative my-12 text-center">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
          <span className="relative bg-white px-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Protocol Override</span>
        </div>

        {/* Manager/Admin Form Toggle */}
        {!showEmailForm ? (
          <button 
            onClick={() => setShowEmailForm(true)}
            className="w-full flex items-center justify-center space-x-2 text-gray-400 hover:text-gray-900 transition-colors py-2 group"
          >
            <LogIn size={14} className="group-hover:translate-x-1 transition-transform" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Sign in with Manager Key</span>
          </button>
        ) : (
          <form onSubmit={handleEmailLogin} className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Manager Identity</label>
              <div className="relative group">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input 
                  type="email" 
                  placeholder="manager@nexus.io" 
                  className="w-full bg-gray-50 border border-gray-100 px-14 py-4 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all text-gray-900 font-medium"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">Passphrase</label>
              <div className="relative group">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  className="w-full bg-gray-50 border border-gray-100 px-14 py-4 rounded-2xl focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all text-gray-900 font-medium"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                type="submit" 
                disabled={loading}
                className="flex-1 bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-3 shadow-xl shadow-blue-100"
              >
                <span className="uppercase tracking-widest text-[10px]">{loading ? "Verifying..." : "Authorize"}</span>
              </button>
              <button 
                type="button"
                onClick={() => setShowEmailForm(false)}
                className="px-6 bg-gray-50 text-gray-400 rounded-2xl hover:bg-gray-100 transition-all"
              >
                <X size={20} />
              </button>
            </div>
          </form>
        )}

        <footer className="mt-12 text-center">
           <div className="flex items-center justify-center space-x-2 text-blue-600/40 mb-4">
              <ShieldCheck size={14} />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">End-to-End Encryption Enabled</span>
           </div>
           <p className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.3em] leading-relaxed">
             Nexus Protocol // Modular Registry v3.0<br/>
             Authorized Personnel Only
           </p>
        </footer>
      </section>
    </main>
  );
}

function X({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
