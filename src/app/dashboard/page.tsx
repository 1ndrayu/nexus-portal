"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { 
  collection, query, where, onSnapshot, doc, getDoc, setDoc 
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { QRCodeSVG } from "qrcode.react";
import { encryptQRPayload, generateHexCode } from "@/lib/logic";
import { 
  ShieldCheck, MapPin, Calendar, Clock, 
  ChevronRight, ArrowRight, User as UserIcon,
  LogOut, LayoutGrid, Zap, Globe, QrCode,
  Shield, Info, ChevronLeft, CreditCard
} from "lucide-react";

interface EventData {
  id: string;
  name: string;
  description: string;
  managerId: string;
  managerName: string;
  config: {
    facilities: string[];
  };
}

interface Registration {
  facilities: Record<string, boolean>;
  status: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [registrations, setRegistrations] = useState<Record<string, Registration>>({});
  const [events, setEvents] = useState<Record<string, EventData>>({});
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        router.push("/login");
        return;
      }

      // Check for profile and registrations
      const userDocRef = doc(db, "users", currentUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // Check if there was a pending registration by email
        const emailDocRef = doc(db, "users", currentUser.email || "unknown");
        const emailDoc = await getDoc(emailDocRef);
        
        if (emailDoc.exists()) {
          // Migration: Move registration from email-id to uid
          const pendingData = emailDoc.data();
          await setDoc(userDocRef, {
            ...pendingData,
            name: currentUser.displayName || pendingData.name || "",
            uid: currentUser.uid
          });
          // Optionally delete the email-based doc
          // await deleteDoc(emailDocRef);
        } else {
          // Create new empty profile
          await setDoc(userDocRef, {
            email: currentUser.email,
            name: currentUser.displayName || "",
            registrations: {},
            uid: currentUser.uid
          });
        }
      }

      // Listen for updates
      const unsubProfile = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRegistrations(data.registrations || {});
          
          // Fetch event details for each registration
          const regIds = Object.keys(data.registrations || {});
          if (regIds.length > 0) {
            regIds.forEach(async (id) => {
              if (!events[id]) {
                const eventSnap = await getDoc(doc(db, "events", id));
                if (eventSnap.exists()) {
                  setEvents(prev => ({ ...prev, [id]: { id, ...eventSnap.data() } as EventData }));
                }
              }
            });
            if (!activeEventId) setActiveEventId(regIds[0]);
          }
        }
        setLoading(false);
      });

      return () => unsubProfile();
    });

    return () => unsubscribeAuth();
  }, [router, activeEventId, events]);

  const handleLogout = async () => {
    await auth.signOut();
    router.push("/");
  };

  const activeEvent = activeEventId ? events[activeEventId] : null;
  const activeReg = activeEventId ? registrations[activeEventId] : null;

  const qrPayload = (user && activeEvent && activeReg) ? encryptQRPayload({
    uid: user.uid,
    eventId: activeEvent.id,
    eventName: activeEvent.name,
    managerId: activeEvent.managerId,
    managerName: activeEvent.managerName,
    facilities: activeReg.facilities
  }) : "";

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 space-y-4">
        <div className="h-16 w-16 bg-blue-600 rounded-[1.5rem] flex items-center justify-center animate-bounce shadow-2xl shadow-blue-100">
           <Zap className="text-white" size={32} />
        </div>
        <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.4em] animate-pulse">Syncing Identity...</p>
      </div>
    );
  }

  const regList = Object.keys(registrations);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-20">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[60%] h-[60%] bg-blue-50/50 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-5%] left-[-5%] w-[40%] h-[40%] bg-purple-50/50 rounded-full blur-[100px]"></div>
      </div>

      <nav className="sticky top-0 z-40 bg-white/70 backdrop-blur-xl border-b border-gray-100 px-6 py-4">
        <div className="max-w-xl mx-auto flex justify-between items-center">
          <div className="flex items-center space-x-3">
             <div className="h-10 w-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
                <ShieldCheck size={20} />
             </div>
             <div>
                <h1 className="text-sm font-black uppercase tracking-tight leading-none">Nexus</h1>
                <p className="text-[8px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">Secure Dashboard</p>
             </div>
          </div>
          <button onClick={handleLogout} className="p-2.5 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
             <LogOut size={18} />
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-xl mx-auto px-6 py-10 space-y-8">
        {/* User Header */}
        <header className="flex items-center space-x-6 animate-in fade-in slide-in-from-top-4 duration-700">
           <div className="h-20 w-20 bg-white p-1 rounded-[1.5rem] shadow-xl border border-gray-100 relative group">
              <div className="absolute inset-0 bg-blue-600 rounded-[1.5rem] opacity-0 group-hover:opacity-10 transition-opacity"></div>
              {user?.photoURL ? (
                <img src={user.photoURL} className="w-full h-full object-cover rounded-[1.4rem]" alt="Profile" />
              ) : (
                <div className="w-full h-full bg-blue-50 text-blue-600 flex items-center justify-center rounded-[1.4rem]">
                   <UserIcon size={32} />
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 h-6 w-6 bg-green-500 border-4 border-white rounded-full"></div>
           </div>
           <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase leading-none">{user?.displayName || "Registry Participant"}</h2>
              <div className="flex items-center space-x-3 mt-3 text-gray-400">
                 <span className="text-[10px] font-bold uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-full">{user?.email}</span>
                 <span className="text-[10px] font-mono font-bold tracking-widest text-blue-600">{generateHexCode(user?.uid || "")}</span>
              </div>
           </div>
        </header>

        {regList.length > 0 ? (
          <>
            {/* Event Switcher */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                 <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Permissions</h3>
                 <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{regList.length} Modules Available</span>
              </div>
              <div className="flex space-x-3 overflow-x-auto pb-4 scrollbar-hide">
                {regList.map(id => (
                  <button 
                    key={id}
                    onClick={() => setActiveEventId(id)}
                    className={`shrink-0 px-8 py-4 rounded-[1.5rem] font-bold text-xs uppercase tracking-widest transition-all border ${activeEventId === id ? 'bg-gray-900 text-white border-gray-900 shadow-2xl shadow-gray-200' : 'bg-white text-gray-400 border-gray-100 hover:border-blue-400'}`}
                  >
                    {events[id]?.name || "Loading..."}
                  </button>
                ))}
              </div>
            </div>

            {activeEvent && activeReg && (
              <div className="animate-in fade-in zoom-in-95 duration-500 space-y-8">
                {/* QR Access Pass */}
                <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.06)] relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
                  <div className="flex flex-col items-center space-y-8">
                    <header className="text-center space-y-2">
                       <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight">{activeEvent.name}</h3>
                       <div className="flex items-center justify-center space-x-2 text-[10px] font-bold text-blue-600 uppercase tracking-widest">
                          <Globe size={12} />
                          <span>Manager: {activeEvent.managerName}</span>
                       </div>
                    </header>
                    
                    <div className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100 relative group-hover:bg-blue-50 transition-colors duration-500">
                      <div className="absolute -top-4 -left-4 h-12 w-12 border-t-4 border-l-4 border-blue-600 rounded-tl-2xl"></div>
                      <div className="absolute -bottom-4 -right-4 h-12 w-12 border-b-4 border-r-4 border-blue-600 rounded-br-2xl"></div>
                      <QRCodeSVG 
                        value={qrPayload} 
                        size={200}
                        level="H"
                        includeMargin={false}
                        className="mix-blend-multiply"
                      />
                    </div>

                    <div className="text-center">
                       <div className="px-6 py-2 bg-blue-50 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-[0.3em] inline-block border border-blue-100">
                          Encrypted Identity Token
                       </div>
                       <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-4">Scan at module entry points for verification</p>
                    </div>
                  </div>
                </div>

                {/* Facility List */}
                <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-sm space-y-8">
                   <div className="flex items-center space-x-3 border-b border-gray-50 pb-6">
                      <Zap className="text-blue-600" size={20} />
                      <h3 className="text-[10px] font-black text-gray-900 uppercase tracking-[0.3em]">Granted Facilities</h3>
                   </div>
                   <div className="grid grid-cols-1 gap-4">
                     {activeEvent.config.facilities.map(facility => {
                       const isAllowed = activeReg.facilities[facility] || false;
                       return (
                         <div key={facility} className={`flex items-center justify-between p-6 rounded-2xl border transition-all ${isAllowed ? 'bg-blue-50/30 border-blue-100 shadow-sm' : 'bg-gray-50 border-transparent opacity-40'}`}>
                           <div className="flex items-center space-x-4">
                              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isAllowed ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                                 {isAllowed ? <ShieldCheck size={16} /> : <Shield size={16} />}
                              </div>
                              <span className="font-bold text-sm uppercase tracking-tight">{facility}</span>
                           </div>
                           <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-md ${isAllowed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                             {isAllowed ? "Access Granted" : "Restricted"}
                           </span>
                         </div>
                       );
                     })}
                   </div>
                </div>

                {/* Module Info */}
                <div className="p-8 bg-gray-900 rounded-[2.5rem] text-white flex items-center justify-between group relative overflow-hidden">
                   <div className="absolute top-[-50%] right-[-10%] w-32 h-32 bg-blue-600/20 rounded-full blur-2xl"></div>
                   <div className="flex items-center space-x-5">
                      <div className="h-12 w-12 bg-white/10 rounded-2xl flex items-center justify-center group-hover:rotate-12 transition-transform">
                         <Info size={24} />
                      </div>
                      <div>
                         <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1">Module ID</p>
                         <p className="text-xs font-mono font-bold tracking-tighter opacity-80">{activeEvent.id}</p>
                      </div>
                   </div>
                   <ChevronRight className="text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all" size={20} />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="bg-white rounded-[3rem] border-2 border-dashed border-gray-100 p-20 flex flex-col items-center text-center space-y-6">
             <div className="h-24 w-24 bg-gray-50 text-gray-200 rounded-[2rem] flex items-center justify-center">
                <CreditCard size={48} />
             </div>
             <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Zero Permissions Found</h3>
             <p className="text-gray-400 text-sm font-medium leading-relaxed max-w-xs">Your identity is not currently associated with any active module. Please contact a manager to receive authorization.</p>
             <button onClick={() => window.location.reload()} className="px-10 py-4 bg-gray-900 text-white rounded-2xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all shadow-xl shadow-gray-200">
               Re-Sync Registry
             </button>
          </div>
        )}
      </main>

      <footer className="text-center px-10 pb-10">
         <p className="text-[9px] font-bold text-gray-300 uppercase tracking-[0.4em] leading-relaxed">
           Nexus Protocol // Real-Time Identity Sync<br/>
           Authorized Participant Environment
         </p>
      </footer>
    </div>
  );
}
