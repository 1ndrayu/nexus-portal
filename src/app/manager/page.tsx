"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { 
  collection, onSnapshot, doc, updateDoc, setDoc, getDoc, 
  query, where, DocumentData, deleteDoc, addDoc, getDocs
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";
import { generateHexCode, decryptQRPayload } from "@/lib/logic";
import { Html5Qrcode } from "html5-qrcode";
import { 
  X, Camera, User as UserIcon, Plus, 
  Search, CheckCircle2, AlertCircle, 
  ShieldCheck, LayoutDashboard, 
  ChevronRight, ArrowLeft, Trash2,
  Globe
} from "lucide-react";

interface Event extends DocumentData {
  id: string;
  name: string;
  description: string;
  managerId: string;
  managerName: string;
  config: {
    facilities: string[];
  };
  createdAt: number;
}

interface Participant extends DocumentData {
  id: string; // UID or Email
  name?: string;
  email?: string;
  registrations: Record<string, {
    facilities: Record<string, boolean>;
    status: string;
  }>;
}

const NexusLogo = ({ className = "h-6 w-6" }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M25 80V20L75 80V20" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function ManagerPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  
  const [view, setView] = useState<"events" | "detail">("events");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [scanResult, setScanResult] = useState<{ status: 'granted' | 'denied', message: string, data?: Record<string, unknown> } | null>(null);
  
  const [newEvent, setNewEvent] = useState({ name: "", description: "", facilities: "WiFi, Catering, VIP Lounge" });
  const [newParticipant, setNewParticipant] = useState({ email: "", name: "" });
  
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribeAuth();
  }, []);

  // Fetch events managed by the user
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "events"), where("managerId", "==", user.uid));
    const unsubscribeEvents = onSnapshot(q, (snapshot) => {
      const eventsData: Event[] = [];
      snapshot.forEach((docSnap) => {
        eventsData.push({ id: docSnap.id, ...docSnap.data() } as Event);
      });
      setEvents(eventsData);
    });
    return () => unsubscribeEvents();
  }, [user]);

  // Fetch participants for the active event
  useEffect(() => {
    if (!activeEventId) {
      setParticipants([]);
      return;
    }
    const q = collection(db, "users");
    const unsubscribeParticipants = onSnapshot(q, (snapshot) => {
      const participantsData: Participant[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.registrations && data.registrations[activeEventId]) {
          participantsData.push({ id: docSnap.id, ...data } as Participant);
        }
      });
      setParticipants(participantsData);
    });
    return () => unsubscribeParticipants();
  }, [activeEventId]);

  const activeEvent = events.find(e => e.id === activeEventId);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const eventData = {
      name: newEvent.name,
      description: newEvent.description,
      managerId: user.uid,
      managerName: user.displayName || "Manager",
      config: {
        facilities: newEvent.facilities.split(",").map(f => f.trim()).filter(f => f)
      },
      createdAt: Date.now()
    };
    
    await addDoc(collection(db, "events"), eventData);
    setIsAddingEvent(false);
    setNewEvent({ name: "", description: "", facilities: "WiFi, Catering, VIP Lounge" });
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEventId || !activeEvent) return;

    const email = newParticipant.email.toLowerCase().trim();
    const name = newParticipant.name.trim();

    // Find if user already exists by email
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email));
    const querySnapshot = await getDocs(q);
    
    let targetId = "";
    let existingData: Participant | null = null;

    if (!querySnapshot.empty) {
      targetId = querySnapshot.docs[0].id;
      existingData = querySnapshot.docs[0].data();
    } else {
      // If user doesn't exist, we use email as temporary ID
      targetId = email; 
    }

    const defaultFacilities: Record<string, boolean> = {};
    activeEvent.config.facilities.forEach(f => {
      defaultFacilities[f] = false;
    });

    const newRegistration = {
      facilities: defaultFacilities,
      status: "verified"
    };

    const userData = {
      email,
      name: name || (existingData?.name || ""),
      registrations: {
        ...(existingData?.registrations || {}),
        [activeEventId]: newRegistration
      },
      updatedAt: Date.now()
    };

    await setDoc(doc(db, "users", targetId), userData, { merge: true });
    
    setIsAddingParticipant(false);
    setNewParticipant({ email: "", name: "" });
  };

  const startScanner = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;
      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScanSuccess,
        () => {}
      );
    } catch (err: unknown) { 
       console.error("Scanner failed to start:", err); 
    }
  };

  const handleScanSuccess = async (decodedText: string) => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch(e){ console.error("Stop failed", e); }
    }
    setIsScanning(false);

    const payload = decryptQRPayload(decodedText);
    if (!payload) {
      setScanResult({ status: 'denied', message: 'Invalid or Expired QR Code' });
      return;
    }
    
    if (activeEventId && payload.eventId !== activeEventId) {
      setScanResult({ status: 'denied', message: `Wrong Event: ${payload.eventName}` });
      return;
    }

    setScanResult({ 
      status: 'granted', 
      message: 'Identity Verified',
      data: payload as unknown as Record<string, unknown>
    });
  };

  const filteredParticipants = participants.filter(p => 
    (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.email || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedParticipant = participants.find(p => p.id === selectedParticipantId) || null;

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <header className="mb-12">
           <div className="h-20 w-20 bg-blue-600 text-white rounded-[2rem] flex items-center justify-center shadow-2xl mx-auto mb-6">
              <NexusLogo className="h-10 w-10" />
           </div>
           <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">Manager Command</h1>
        </header>
        <p className="text-gray-500 mb-8 max-w-sm">Authorization required to access the registry command modules.</p>
        <button onClick={() => router.push("/login")} className="bg-gray-900 text-white font-bold px-10 py-4 rounded-2xl hover:bg-blue-600 transition-all shadow-xl shadow-gray-200">
          Authorize Session
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Sidebar */}
      <aside className="md:fixed left-0 top-0 h-auto md:h-full w-full md:w-80 bg-white border-r border-gray-100 flex flex-col z-30">
        <div className="p-8 border-b border-gray-50 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
               <NexusLogo />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Nexus</h1>
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-1">Manager V3</p>
            </div>
          </div>
        </div>

        {view === "detail" && activeEvent && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
               <button 
                 onClick={() => { setView("events"); setActiveEventId(null); }}
                 className="flex items-center space-x-2 text-[10px] font-bold text-gray-400 hover:text-blue-600 uppercase tracking-widest transition-colors mb-4"
               >
                 <ArrowLeft size={14} />
                 <span>Switch Event</span>
               </button>
               <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight truncate">{activeEvent.name}</h2>
               <div className="mt-4 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input 
                    type="text" 
                    placeholder="Search registry..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-gray-100 rounded-xl py-3 pl-11 pr-4 text-xs font-bold focus:border-blue-500 outline-none transition-all shadow-sm"
                  />
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <div className="flex items-center justify-between px-2 mb-2">
                 <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Participants</h3>
                 <button onClick={() => setIsAddingParticipant(true)} className="h-6 w-6 bg-blue-600 text-white rounded-md flex items-center justify-center shadow-md">
                    <Plus size={14} />
                 </button>
              </div>
              {filteredParticipants.map(participant => (
                <div 
                  key={participant.id}
                  onClick={() => setSelectedParticipantId(participant.id)}
                  className={`p-4 rounded-2xl cursor-pointer transition-all flex items-center justify-between border ${selectedParticipantId === participant.id ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' : 'bg-white border-transparent hover:bg-gray-50'}`}
                >
                  <div className="overflow-hidden">
                    <p className="font-bold text-sm leading-tight truncate">{participant.name || participant.email}</p>
                    <p className={`text-[10px] font-bold mt-1 uppercase tracking-wider ${selectedParticipantId === participant.id ? 'text-blue-100' : 'text-gray-400'}`}>
                       {participant.email}
                    </p>
                  </div>
                  <ChevronRight size={14} className={selectedParticipantId === participant.id ? 'text-white' : 'text-gray-200'} />
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "events" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Managed Environments</h2>
               <button onClick={() => setIsAddingEvent(true)} className="h-8 w-8 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg">
                  <Plus size={18} />
               </button>
            </div>
            {events.map(event => (
              <div 
                key={event.id}
                onClick={() => { setActiveEventId(event.id); setView("detail"); }}
                className="p-6 bg-white border border-gray-100 rounded-3xl hover:border-blue-600 hover:shadow-xl hover:shadow-blue-50 transition-all cursor-pointer group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 h-1 w-full bg-blue-600 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                <h3 className="font-bold text-gray-900 mb-1 uppercase tracking-tight">{event.name}</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{event.config.facilities.length} Facilities Linked</p>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-center py-20">
                 <LayoutDashboard className="mx-auto text-gray-100 mb-4" size={48} />
                 <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Zero Active Environments</p>
              </div>
            )}
          </div>
        )}

        <div className="p-8 border-t border-gray-50">
           <button 
             onClick={async () => { await auth.signOut(); router.push("/"); }}
             className="w-full flex items-center justify-center space-x-3 bg-gray-50 text-gray-500 font-bold py-4 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all uppercase text-[10px] tracking-[0.2em]"
           >
              <X size={14} />
              <span>Deauthorize Session</span>
           </button>
        </div>
      </aside>

      {/* Main Area */}
      <main className="md:ml-80 p-6 md:p-12 lg:p-20 min-h-screen">
        <div className="max-w-5xl mx-auto">
          {view === "events" ? (
            <div className="space-y-12">
              <header className="animate-in fade-in slide-in-from-top-4 duration-700">
                <h1 className="text-5xl font-black text-gray-900 mb-4 tracking-tighter uppercase">Command Dashboard</h1>
                <p className="text-gray-500 max-w-xl font-medium">Create modular environments and manage participant access with real-time privilege synchronization.</p>
              </header>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <button 
                  onClick={() => setIsAddingEvent(true)}
                  className="p-12 bg-blue-600 rounded-[3rem] text-white hover:bg-blue-700 transition-all flex flex-col items-start text-left group shadow-2xl shadow-blue-100 relative overflow-hidden"
                >
                  <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-white/10 rounded-full blur-3xl"></div>
                  <div className="h-16 w-16 bg-white/20 rounded-2xl flex items-center justify-center mb-10 group-hover:scale-110 transition-transform relative z-10">
                    <Plus size={32} />
                  </div>
                  <h3 className="text-2xl font-black mb-2 uppercase tracking-tight relative z-10">New Module</h3>
                  <p className="text-blue-100 text-sm font-medium relative z-10">Initialize a new identity-synced environment.</p>
                </button>
                
                <div className="p-12 bg-white border border-gray-100 rounded-[3rem] flex flex-col items-start text-left relative overflow-hidden shadow-sm">
                   <div className="h-16 w-16 bg-gray-50 text-gray-900 rounded-2xl flex items-center justify-center mb-10">
                      <Globe size={32} />
                   </div>
                   <h3 className="text-2xl font-black mb-2 uppercase tracking-tight text-gray-900">{events.length} Modules Active</h3>
                   <p className="text-gray-400 text-sm font-medium">Universal Registry synchronization enabled.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-12">
              {/* Event Header */}
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 animate-in fade-in duration-700">
                 <div>
                    <div className="flex items-center space-x-3 text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-4">
                       <ShieldCheck size={14} />
                       <span>Active Environment Module</span>
                    </div>
                    <h1 className="text-5xl font-black text-gray-900 tracking-tighter uppercase">{activeEvent?.name}</h1>
                    <p className="text-gray-400 font-medium mt-2">{activeEvent?.description}</p>
                 </div>
                 <button 
                   onClick={startScanner}
                   className="flex items-center space-x-4 bg-gray-900 text-white px-10 py-5 rounded-3xl hover:bg-blue-600 transition-all shadow-2xl shadow-gray-200 group"
                 >
                    <Camera size={20} className="group-hover:rotate-12 transition-transform" />
                    <span className="font-bold uppercase tracking-widest text-xs">Activate Scanner</span>
                 </button>
              </div>

              {/* Verification Result */}
              {scanResult && (
                <div className={`p-10 rounded-[2.5rem] border-2 flex flex-col md:flex-row items-center gap-10 animate-in zoom-in-95 duration-500 ${scanResult.status === 'granted' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className={`h-24 w-24 rounded-[2rem] flex items-center justify-center ${scanResult.status === 'granted' ? 'bg-green-600' : 'bg-red-600'} text-white shadow-xl`}>
                    {scanResult.status === 'granted' ? <CheckCircle2 size={48} /> : <AlertCircle size={48} />}
                  </div>
                  <div className="text-center md:text-left flex-1">
                    <h2 className={`text-3xl font-black mb-2 uppercase tracking-tight ${scanResult.status === 'granted' ? 'text-green-900' : 'text-red-900'}`}>
                      {scanResult.status === 'granted' ? 'Verified Participant' : 'Access Restricted'}
                    </h2>
                    <p className="text-base font-bold opacity-60 mb-6 uppercase tracking-wider">{scanResult.message}</p>
                    {scanResult.data && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5">
                           <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Identity</p>
                           <p className="text-xs font-black truncate">{scanResult.data.uid}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5">
                           <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Module</p>
                           <p className="text-xs font-black truncate">{scanResult.data.eventName}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5">
                           <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Manager</p>
                           <p className="text-xs font-black truncate">{scanResult.data.managerName}</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 col-span-2">
                           <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Granted Privileges</p>
                           <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(scanResult.data.facilities as Record<string, boolean>).filter(([_, v]) => v).map(([k]) => (
                                <span key={k} className="bg-green-50 text-green-700 text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter">{k}</span>
                              ))}
                              {Object.values(scanResult.data.facilities as Record<string, boolean>).every(v => !v) && <span className="text-[8px] text-gray-400 italic">No privileges</span>}
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setScanResult(null)} className="bg-white border-2 border-gray-100 text-gray-900 font-bold px-10 py-4 rounded-2xl hover:border-gray-900 transition-all uppercase text-[10px] tracking-widest">Clear</button>
                </div>
              )}

              {/* Detailed Participant Profile */}
              {selectedParticipant ? (
                <div className="bg-white rounded-[3rem] border border-gray-100 p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.04)] relative animate-in fade-in slide-in-from-bottom-4 duration-700">
                  <button onClick={() => setSelectedParticipantId(null)} className="absolute top-8 right-8 h-12 w-12 rounded-full hover:bg-gray-50 flex items-center justify-center transition-colors text-gray-400">
                    <X size={20} />
                  </button>

                  <div className="flex flex-col md:flex-row items-center md:items-start gap-10 mb-16">
                    <div className="h-32 w-32 bg-blue-50 text-blue-600 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-blue-50 relative overflow-hidden">
                      <UserIcon size={48} />
                      <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-600"></div>
                    </div>
                    <div className="text-center md:text-left pt-4">
                      <h2 className="text-4xl font-black text-gray-900 mb-2 tracking-tighter uppercase">{selectedParticipant.name || "Registry Entry"}</h2>
                      <p className="text-lg text-gray-400 font-bold tracking-tight mb-6">{selectedParticipant.email}</p>
                      <div className="flex justify-center md:justify-start gap-4">
                        <div className="px-6 py-2 bg-gray-900 text-white rounded-full text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-gray-200">Participant</div>
                        <div className="px-6 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-[10px] font-mono font-bold tracking-widest">{generateHexCode(selectedParticipant.id)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-12 border-t border-gray-50">
                    <div className="space-y-6">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-6">Facility Access Control</h3>
                      <div className="grid grid-cols-1 gap-3">
                        {activeEvent?.config.facilities.map(facility => {
                          const isActive = selectedParticipant.registrations[activeEventId!].facilities[facility] || false;
                          return (
                            <div key={facility} className="flex justify-between items-center p-5 bg-gray-50/50 rounded-2xl border border-transparent hover:border-blue-100 hover:bg-white transition-all group">
                              <span className="font-bold text-sm text-gray-700 uppercase tracking-tight">{facility}</span>
                              <button 
                                onClick={async () => {
                                  const newRegs = { ...selectedParticipant.registrations };
                                  newRegs[activeEventId!].facilities[facility] = !isActive;
                                  await updateDoc(doc(db, "users", selectedParticipant.id), { registrations: newRegs });
                                }}
                                className={`w-14 h-8 rounded-full transition-all relative ${isActive ? 'bg-blue-600 shadow-lg shadow-blue-100' : 'bg-gray-200'}`}
                              >
                                <div className={`h-6 w-6 bg-white rounded-full absolute top-1 transition-all ${isActive ? 'left-7' : 'left-1'}`} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    
                    <div className="space-y-8">
                       <div className="bg-gray-900 rounded-[2.5rem] p-10 flex flex-col items-center justify-center text-center space-y-6 relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>
                          <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center text-blue-400 shadow-2xl">
                             <ShieldCheck size={32} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-white uppercase tracking-widest mb-2">Real-Time Sync Active</p>
                            <p className="text-[10px] text-gray-400 font-medium leading-relaxed max-w-[200px]">All privilege updates are instantly propagated to the participant&apos;s identity token.</p>
                          </div>
                       </div>
                       
                       <button 
                         onClick={async () => {
                           if (confirm("Permanently deauthorize this participant from the current module?")) {
                             const newRegs = { ...selectedParticipant.registrations };
                             delete newRegs[activeEventId!];
                             await updateDoc(doc(db, "users", selectedParticipant.id), { registrations: newRegs });
                             setSelectedParticipantId(null);
                           }
                         }}
                         className="w-full flex items-center justify-center space-x-3 text-red-500 bg-white border-2 border-gray-100 hover:border-red-100 hover:bg-red-50 py-5 rounded-[1.5rem] transition-all font-black uppercase text-[10px] tracking-widest"
                       >
                          <Trash2 size={18} />
                          <span>Deauthorize Participant</span>
                       </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[3rem] border-2 border-dashed border-gray-100 p-24 flex flex-col items-center text-center">
                   <div className="h-32 w-32 bg-gray-50 text-gray-200 rounded-[2.5rem] flex items-center justify-center mb-8">
                      <UserIcon size={64} />
                   </div>
                   <h3 className="text-3xl font-black text-gray-900 mb-4 tracking-tighter uppercase">No Profile Selected</h3>
                   <p className="text-gray-400 max-w-sm font-medium">Select a participant from the registry or activate the scanner to manage identity privileges.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {isAddingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => setIsAddingEvent(false)} />
          <div className="bg-white w-full max-w-2xl rounded-[3rem] p-12 relative z-10 shadow-2xl animate-in zoom-in-95 duration-500">
            <header className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Initialize Module</h2>
              <button onClick={() => setIsAddingEvent(false)} className="h-10 w-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors">
                <X size={20} />
              </button>
            </header>
            <form onSubmit={handleCreateEvent} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Module Name</label>
                  <input type="text" className="w-full bg-gray-50 border border-gray-100 px-6 py-4 rounded-2xl focus:bg-white focus:border-blue-600 outline-none font-bold text-sm" required value={newEvent.name} onChange={(e) => setNewEvent({...newEvent, name: e.target.value})} placeholder="e.g. Nexus Conference 2026" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Description</label>
                  <input type="text" className="w-full bg-gray-50 border border-gray-100 px-6 py-4 rounded-2xl focus:bg-white focus:border-blue-600 outline-none font-bold text-sm" required value={newEvent.description} onChange={(e) => setNewEvent({...newEvent, description: e.target.value})} placeholder="Event purpose or location" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Custom Facilities (Comma separated)</label>
                <textarea className="w-full bg-gray-50 border border-gray-100 px-6 py-4 rounded-2xl focus:bg-white focus:border-blue-600 outline-none font-bold text-sm h-32" required value={newEvent.facilities} onChange={(e) => setNewEvent({...newEvent, facilities: e.target.value})} placeholder="WiFi, VIP Lounge, Main Stage, Catering..." />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-blue-600 text-white font-black py-5 rounded-[1.5rem] hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 uppercase tracking-widest text-sm">
                  Initialize Registry Environment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddingParticipant && activeEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={() => setIsAddingParticipant(false)} />
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-12 relative z-10 shadow-2xl animate-in zoom-in-95 duration-500">
            <header className="flex justify-between items-center mb-10">
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">Add Participant</h2>
              <button onClick={() => setIsAddingParticipant(false)} className="h-10 w-10 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors">
                <X size={20} />
              </button>
            </header>
            <form onSubmit={handleAddParticipant} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Google ID / Email Identifier</label>
                <input type="email" className="w-full bg-gray-50 border border-gray-100 px-6 py-4 rounded-2xl focus:bg-white focus:border-blue-600 outline-none font-bold text-sm" required value={newParticipant.email} onChange={(e) => setNewParticipant({...newParticipant, email: e.target.value})} placeholder="participant@gmail.com" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Full Name (Optional)</label>
                <input type="text" className="w-full bg-gray-50 border border-gray-100 px-6 py-4 rounded-2xl focus:bg-white focus:border-blue-600 outline-none font-bold text-sm" value={newParticipant.name} onChange={(e) => setNewParticipant({...newParticipant, name: e.target.value})} placeholder="Display name" />
              </div>
              <div className="pt-4">
                <button type="submit" className="w-full bg-blue-600 text-white font-black py-5 rounded-[1.5rem] hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 uppercase tracking-widest text-sm">
                  Register in Module
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Universal Scanner Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
           <div className="relative z-10 w-full max-w-xl flex flex-col items-center">
              <div className="mb-12 text-center">
                 <h2 className="text-white text-4xl font-black uppercase tracking-tighter mb-4">Nexus Lens</h2>
                 <div className="flex items-center justify-center space-x-3 text-blue-400 text-xs font-bold uppercase tracking-[0.3em]">
                    <div className="h-2 w-2 bg-blue-400 rounded-full animate-pulse"></div>
                    <span>Active Scanning Protocol</span>
                 </div>
              </div>
              <div className="w-full rounded-[3rem] overflow-hidden bg-black aspect-square relative border-4 border-white/10 shadow-[0_0_100px_rgba(59,130,246,0.2)]">
                 <div id="reader" className="w-full h-full"></div>
                 {/* Scanner Sight */}
                 <div className="absolute inset-10 border-2 border-blue-500/30 rounded-[2rem] pointer-events-none">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-xl"></div>
                    <div className="absolute top-1/2 left-0 w-full h-0.5 bg-blue-500/20 animate-pulse"></div>
                 </div>
              </div>
              <button 
                onClick={() => {
                  if (scannerRef.current) scannerRef.current.stop();
                  setIsScanning(false);
                }}
                className="mt-12 bg-white text-gray-900 px-12 py-5 rounded-[2rem] font-black uppercase tracking-widest text-xs hover:bg-red-600 hover:text-white transition-all shadow-2xl"
              >
                Abort Protocol
              </button>
           </div>
        </div>
      )}
    </div>
  );
}
