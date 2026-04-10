/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mic, 
  MicOff, 
  Power, 
  Globe, 
  Sparkles, 
  Volume2, 
  History, 
  X, 
  Trash2, 
  Settings, 
  LogIn, 
  LogOut, 
  Plus, 
  ChevronRight, 
  Edit2, 
  Monitor,
  ShieldCheck,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveSession, SessionState } from "@/lib/live-session";
import { cn } from "@/lib/utils";
import { AdminPanel } from "@/components/AdminPanel";
import { SystemControls } from "./components/SystemControls";
import { auth, db, signIn, signOut } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  deleteDoc,
  updateDoc,
  setDoc,
  getDocs,
  writeBatch,
  getDocFromServer,
  doc
} from "firebase/firestore";
import { onAuthStateChanged, User } from "firebase/auth";

interface Message {
  id: string;
  text: string;
  isModel: boolean;
  timestamp: any;
  uid: string;
}

interface VoiceProfile {
  id: string;
  name: string;
  voiceName: string;
  personality: string;
  uid: string;
  isDefault?: boolean;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [state, setState] = useState<SessionState>("disconnected");
  const [volume, setVolume] = useState(0);
  const [history, setHistory] = useState<Message[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminClickCount, setAdminClickCount] = useState(0);
  const [selectedVoice, setSelectedVoice] = useState("Kore");
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profiles" | "permissions">("profiles");
  const [editingProfile, setEditingProfile] = useState<Partial<VoiceProfile> | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const sessionRef = useRef<LiveSession | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const adminTimeoutRef = useRef<number | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenCaptureIntervalRef = useRef<number | null>(null);

  const handleAdminClick = () => {
    setAdminClickCount(prev => prev + 1);
    if (adminTimeoutRef.current) clearTimeout(adminTimeoutRef.current);
    
    adminTimeoutRef.current = window.setTimeout(() => {
      setAdminClickCount(0);
    }, 2000);

    if (adminClickCount + 1 >= 5) {
      setShowAdmin(true);
      setAdminClickCount(0);
    }
  };

  // Test connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore History Listener
  useEffect(() => {
    if (!user || !isAuthReady) {
      setHistory([]);
      return;
    }

    const path = 'messages';
    const q = query(
      collection(db, path),
      where("uid", "==", user.uid),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      })) as Message[];
      setHistory(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  // Profiles Listener
  useEffect(() => {
    if (!user || !isAuthReady) {
      setProfiles([]);
      return;
    }

    const path = 'profiles';
    const q = query(
      collection(db, path),
      where("uid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VoiceProfile[];
      setProfiles(p);
      
      // Set active profile if not set or if current active is gone
      if (p.length > 0) {
        const defaultProfile = p.find(prof => prof.isDefault) || p[0];
        if (!activeProfileId || !p.find(prof => prof.id === activeProfileId)) {
          setActiveProfileId(defaultProfile.id);
        }
      }
    }, (error) => {
      // If it's a permission error, we might want to log more info or handle it gracefully
      if (error instanceof Error && error.message.includes('permission')) {
        console.warn("Profile permission issue, retrying or checking auth...");
      }
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user?.uid, isAuthReady]); // Only re-run if user UID or auth readiness changes

  useEffect(() => {
    sessionRef.current = new LiveSession(
      (newState) => setState(newState),
      async (text, isModel) => {
        if (!auth.currentUser) return;
        
        const path = 'messages';
        try {
          await addDoc(collection(db, path), {
            text,
            isModel,
            timestamp: serverTimestamp(),
            uid: auth.currentUser.uid
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      }
    );

    return () => {
      sessionRef.current?.disconnect();
      stopScreenShare();
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history]);

  useEffect(() => {
    if (state !== "disconnected" && state !== "connecting") {
      volumeIntervalRef.current = window.setInterval(() => {
        if (sessionRef.current) {
          setVolume(sessionRef.current.getVolume());
        }
      }, 50);
    } else {
      if (volumeIntervalRef.current) {
        clearInterval(volumeIntervalRef.current);
        volumeIntervalRef.current = null;
      }
      setVolume(0);
    }
  }, [state]);

  const toggleSession = async () => {
    if (state === "disconnected") {
      const activeProfile = profiles.find(p => p.id === activeProfileId);
      const voice = activeProfile?.voiceName || selectedVoice;
      const personality = activeProfile?.personality || "";
      await sessionRef.current?.connect(voice, personality);
    } else {
      sessionRef.current?.disconnect();
      stopScreenShare();
    }
  };

  const clearHistory = async () => {
    if (!user) return;
    const path = 'messages';
    try {
      const q = query(collection(db, path), where("uid", "==", user.uid));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const saveProfile = async (profile: Partial<VoiceProfile>) => {
    if (!user) return;
    const path = 'profiles';
    try {
      // Extract only the fields we want to save to avoid sending 'id' or other extraneous fields
      const { id, ...dataToSave } = profile;
      const finalData = {
        ...dataToSave,
        uid: user.uid,
        isDefault: profile.isDefault ?? (profiles.length === 0)
      };

      if (id) {
        await updateDoc(doc(db, path, id), finalData);
      } else {
        await addDoc(collection(db, path), finalData);
      }
      setIsEditingProfile(false);
      setEditingProfile(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteProfile = async (id: string) => {
    const path = 'profiles';
    try {
      await deleteDoc(doc(db, path, id));
      if (activeProfileId === id) {
        setActiveProfileId(profiles.find(p => p.id !== id)?.id || null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const setDefaultProfile = async (id: string) => {
    if (!user) return;
    const path = 'profiles';
    try {
      const batch = writeBatch(db);
      profiles.forEach(p => {
        batch.update(doc(db, path, p.id), { isDefault: p.id === id });
      });
      await batch.commit();
      setActiveProfileId(id);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const toggleScreenShare = async () => {
    setErrorMessage(null);
    if (isScreenSharing) {
      stopScreenShare();
    } else {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        setErrorMessage("Screen sharing is not supported in this browser or environment. Try opening the app in a new tab.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 5 },
          audio: false
        });
        screenStreamRef.current = stream;
        setIsScreenSharing(true);

        // Setup hidden video element to play the stream
        if (!videoRef.current) {
          videoRef.current = document.createElement("video");
        }
        videoRef.current.srcObject = stream;
        videoRef.current.play();

        // Setup canvas to capture frames
        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }

        // Start capture loop
        screenCaptureIntervalRef.current = window.setInterval(() => {
          if (videoRef.current && canvasRef.current && sessionRef.current && state === "listening" || state === "connected") {
            const canvas = canvasRef.current;
            const video = videoRef.current;
            const context = canvas.getContext("2d");
            
            if (context) {
              // Resize canvas to match video but keep it reasonable
              const scale = Math.min(1, 640 / video.videoWidth);
              canvas.width = video.videoWidth * scale;
              canvas.height = video.videoHeight * scale;
              
              context.drawImage(video, 0, 0, canvas.width, canvas.height);
              const base64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
              sessionRef.current.sendVideoFrame(base64);
            }
          }
        }, 1000); // Send frame every second

        stream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };
      } catch (error) {
        console.error("Error sharing screen:", error);
        setErrorMessage("Failed to start screen sharing. Please check permissions.");
      }
    }
  };

  const stopScreenShare = () => {
    if (screenCaptureIntervalRef.current) {
      clearInterval(screenCaptureIntervalRef.current);
      screenCaptureIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);
  };

  const getStatusColor = () => {
    switch (state) {
      case "connecting": return "text-yellow-400";
      case "listening": return "text-cyan-400";
      case "speaking": return "text-pink-500";
      case "connected": return "text-green-400";
      default: return "text-gray-500";
    }
  };

  const getStatusText = () => {
    switch (state) {
      case "connecting": return "Waking up Zoya...";
      case "listening": return "Zoya is listening...";
      case "speaking": return "Zoya is talking...";
      case "connected": return "Ready for Zoya";
      default: return "Zoya is sleeping";
    }
  };

  return (
    <div className="fixed inset-0 bg-[#050505] text-white font-sans overflow-hidden flex flex-col items-center justify-center">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div 
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] transition-all duration-1000 opacity-20",
            state === "speaking" ? "bg-pink-500 opacity-30" : 
            state === "listening" ? "bg-cyan-500 opacity-30" : 
            state === "connecting" ? "bg-yellow-500 opacity-20" : "bg-purple-900 opacity-10"
          )}
        />
      </div>

      {/* Header */}
      <div className="absolute top-8 left-8 right-8 flex justify-between items-start z-10">
        <div onClick={handleAdminClick} className="cursor-pointer select-none">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-black tracking-tighter uppercase italic"
          >
            Zoya
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.2 }}
            className="text-xs font-mono uppercase tracking-[0.2em] mt-1"
          >
            Voice-to-Voice AI Assistant
          </motion.p>
        </div>
        
        <div className="flex gap-4 items-center">
          {user && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut()}
              className="text-zinc-400 hover:text-red-400 hover:bg-red-400/10"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleScreenShare}
            className={cn(
              "transition-all duration-300",
              isScreenSharing ? "text-cyan-400 bg-cyan-400/10" : "text-zinc-400 hover:text-white hover:bg-white/10"
            )}
            title={isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
          >
            <Monitor className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
            className="text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <Settings className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(true)}
            className="text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <History className="w-6 h-6" />
          </Button>
          <div className="flex flex-col items-end">
            <span className={cn("text-[10px] font-mono uppercase tracking-widest transition-colors duration-300", getStatusColor())}>
              System Status
            </span>
            <span className="text-sm font-medium">{getStatusText()}</span>
          </div>
          {isScreenSharing && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full"
            >
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">Vision Active</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Error Message */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg backdrop-blur-md flex items-center gap-3"
          >
            <span className="text-xs font-medium text-red-200">{errorMessage}</span>
            <button 
              onClick={() => setErrorMessage(null)}
              className="text-red-400 hover:text-red-200"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Interaction Area */}
      {!user && isAuthReady ? (
        <div className="relative flex flex-col items-center justify-center gap-8 z-10 w-full max-w-md px-6 text-center">
          <div className="w-24 h-24 bg-pink-500/10 rounded-full flex items-center justify-center border border-pink-500/20">
            <Sparkles className="w-12 h-12 text-pink-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-2 uppercase italic">Meet Zoya</h2>
            <p className="text-zinc-500 text-sm">Sign in to start your sassy conversation and save your memories.</p>
          </div>
          <Button 
            onClick={() => signIn()}
            className="bg-pink-600 hover:bg-pink-500 text-white rounded-full px-12 py-6 font-bold uppercase tracking-widest text-xs shadow-lg shadow-pink-500/20"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Sign in with Google
          </Button>
        </div>
      ) : (
        <div className="relative flex flex-col items-center justify-center gap-12 z-10 w-full max-w-md px-6">
          
          {/* Visualizer / Avatar */}
          <div className="relative w-64 h-64 flex items-center justify-center">
            {/* Outer Rings */}
            <AnimatePresence>
              {state !== "disconnected" && (
                <>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ 
                      scale: 1 + volume * 0.5, 
                      opacity: 0.1 + volume * 0.2,
                      borderColor: state === "speaking" ? "#ec4899" : "#22d3ee"
                    }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="absolute inset-0 border-2 rounded-full"
                  />
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ 
                      scale: 1.2 + volume * 0.8, 
                      opacity: 0.05 + volume * 0.1,
                      borderColor: state === "speaking" ? "#ec4899" : "#22d3ee"
                    }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className="absolute inset-0 border rounded-full"
                  />
                </>
              )}
            </AnimatePresence>

            {/* Central Button */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleSession}
              disabled={state === "connecting"}
              className={cn(
                "relative w-40 h-40 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl z-20",
                state === "disconnected" ? "bg-zinc-900 border border-zinc-800" : 
                state === "connecting" ? "bg-zinc-800 animate-pulse" :
                state === "speaking" ? "bg-pink-600 shadow-pink-500/50" : "bg-cyan-600 shadow-cyan-500/50"
              )}
            >
              {state === "disconnected" ? (
                <Power className="w-12 h-12 text-zinc-400" />
              ) : state === "connecting" ? (
                <Sparkles className="w-12 h-12 text-yellow-400 animate-spin-slow" />
              ) : (
                <div className="flex items-center justify-center">
                  {state === "speaking" ? (
                    <Volume2 className="w-16 h-16 text-white" />
                  ) : (
                    <Mic className="w-16 h-16 text-white" />
                  )}
                </div>
              )}
            </motion.button>

            {/* Waveform Visualization (Simple) */}
            <div className="absolute -bottom-16 flex items-end justify-center gap-1 h-12 w-48">
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={{ 
                    height: state === "disconnected" ? 4 : Math.max(4, volume * 48 * (0.5 + Math.random() * 0.5))
                  }}
                  className={cn(
                    "w-1.5 rounded-full transition-colors duration-300",
                    state === "speaking" ? "bg-pink-500" : 
                    state === "listening" ? "bg-cyan-500" : "bg-zinc-800"
                  )}
                />
              ))}
            </div>
          </div>

          {/* Personality Quote / Hint */}
          <div className="text-center mt-8">
            <AnimatePresence mode="wait">
              {state === "disconnected" ? (
                <motion.p
                  key="idle"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-zinc-500 text-sm font-medium italic"
                >
                  "Don't be shy, I don't bite... much."
                </motion.p>
              ) : state === "listening" ? (
                <motion.p
                  key="listening"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-cyan-400 text-sm font-medium italic"
                >
                  {isScreenSharing ? "I see you... and your screen. 😉" : "I'm all ears, babe. What's on your mind?"}
                </motion.p>
              ) : state === "speaking" ? (
                <motion.p
                  key="speaking"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-pink-400 text-sm font-medium italic"
                >
                  "Listen closely, I'm dropping wisdom here."
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <AdminPanel 
        isOpen={showAdmin} 
        onClose={() => setShowAdmin(false)} 
        history={history}
        sessionState={state}
      />
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowSettings(false);
                setIsEditingProfile(false);
                setEditingProfile(null);
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl p-8 z-50 flex flex-col shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold tracking-tight uppercase italic flex items-center gap-2">
                  {isEditingProfile ? (
                    <>
                      <Edit2 className="w-5 h-5 text-cyan-400" />
                      Edit Profile
                    </>
                  ) : (
                    <>
                      <Settings className="w-5 h-5 text-cyan-400" />
                      Settings
                    </>
                  )}
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (isEditingProfile) {
                      setIsEditingProfile(false);
                      setEditingProfile(null);
                    } else {
                      setShowSettings(false);
                    }
                  }}
                  className="text-zinc-500 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </Button>
              </div>

              {!isEditingProfile && (
                <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-xl border border-white/5">
                  <button
                    onClick={() => setSettingsTab("profiles")}
                    className={cn(
                      "flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                      settingsTab === "profiles" 
                        ? "bg-cyan-500 text-white shadow-lg" 
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Profiles
                  </button>
                  <button
                    onClick={() => setSettingsTab("permissions")}
                    className={cn(
                      "flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                      settingsTab === "permissions" 
                        ? "bg-cyan-500 text-white shadow-lg" 
                        : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    Permissions
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                <AnimatePresence mode="wait">
                  {isEditingProfile ? (
                    <motion.div
                      key="edit"
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                      className="space-y-6"
                    >
                      <div className="space-y-4">
                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2 block">Profile Name</label>
                          <input 
                            type="text"
                            value={editingProfile?.name || ""}
                            onChange={(e) => setEditingProfile(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. Sassy Zoya"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-cyan-500 outline-none transition-colors"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2 block">Voice</label>
                          <div className="grid grid-cols-5 gap-2">
                            {["Aoede", "Charon", "Fenrir", "Kore", "Puck"].map((voice) => (
                              <button
                                key={voice}
                                onClick={() => setEditingProfile(prev => ({ ...prev, voiceName: voice }))}
                                className={cn(
                                  "flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-300",
                                  editingProfile?.voiceName === voice 
                                    ? "bg-cyan-500/10 border-cyan-500 text-cyan-400" 
                                    : "bg-white/5 border-white/5 text-zinc-500 hover:bg-white/10"
                                )}
                              >
                                <div className="w-2 h-2 rounded-full mb-1 bg-current" />
                                <span className="text-[8px] font-bold uppercase tracking-tighter">{voice}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2 block">Personality & Traits</label>
                          <textarea 
                            value={editingProfile?.personality || ""}
                            onChange={(e) => setEditingProfile(prev => ({ ...prev, personality: e.target.value }))}
                            placeholder="Describe Zoya's personality..."
                            className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-zinc-300 focus:border-cyan-500 outline-none transition-colors resize-none"
                          />
                        </div>
                      </div>

                      <div className="flex gap-3 pt-4">
                        <Button
                          onClick={() => {
                            setIsEditingProfile(false);
                            setEditingProfile(null);
                          }}
                          variant="ghost"
                          className="flex-1 rounded-xl text-zinc-400"
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={() => saveProfile(editingProfile!)}
                          disabled={!editingProfile?.name}
                          className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold uppercase tracking-widest text-[10px]"
                        >
                          Save Profile
                        </Button>
                      </div>
                    </motion.div>
                  ) : settingsTab === "profiles" ? (
                    <motion.div
                      key="list"
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 20, opacity: 0 }}
                      className="space-y-6"
                    >
                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">
                            Voice Profiles
                          </label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setIsEditingProfile(true);
                              setEditingProfile({
                                name: "",
                                voiceName: "Kore",
                                personality: "You are Zoya, a young, confident, witty, and sassy female AI assistant..."
                              });
                            }}
                            className="h-7 text-[10px] uppercase tracking-widest text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10"
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            New Profile
                          </Button>
                        </div>
                        
                        <div className="space-y-2">
                          {profiles.length === 0 ? (
                            <div className="p-4 bg-white/5 border border-dashed border-white/10 rounded-2xl text-center">
                              <p className="text-xs text-zinc-500 italic">No custom profiles yet.</p>
                            </div>
                          ) : (
                            profiles.map((profile) => (
                              <div
                                key={profile.id}
                                className={cn(
                                  "group flex items-center justify-between p-4 rounded-2xl border transition-all duration-300",
                                  activeProfileId === profile.id 
                                    ? "bg-cyan-500/10 border-cyan-500/30" 
                                    : "bg-white/5 border-white/5 hover:bg-white/10"
                                )}
                              >
                                <div 
                                  className="flex-1 cursor-pointer"
                                  onClick={() => setDefaultProfile(profile.id)}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={cn(
                                      "font-bold text-sm tracking-tight",
                                      activeProfileId === profile.id ? "text-cyan-400" : "text-zinc-300"
                                    )}>
                                      {profile.name}
                                    </span>
                                    {profile.isDefault && (
                                      <span className="text-[8px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded uppercase font-bold">Default</span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mt-0.5">
                                    Voice: {profile.voiceName}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setEditingProfile(profile);
                                      setIsEditingProfile(true);
                                    }}
                                    className="h-8 w-8 text-zinc-500 hover:text-cyan-400"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => deleteProfile(profile.id)}
                                    className="h-8 w-8 text-zinc-500 hover:text-red-400"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5">
                        <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-3 block">
                          Quick Voice Override
                        </label>
                        <div className="grid grid-cols-5 gap-2">
                          {["Aoede", "Charon", "Fenrir", "Kore", "Puck"].map((voice) => (
                            <button
                              key={voice}
                              onClick={() => setSelectedVoice(voice)}
                              className={cn(
                                "flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-300",
                                selectedVoice === voice 
                                  ? "bg-pink-500/10 border-pink-500 text-pink-400" 
                                  : "bg-white/5 border-white/5 text-zinc-500 hover:bg-white/10"
                              )}
                            >
                              <div className="w-2 h-2 rounded-full mb-1 bg-current" />
                              <span className="text-[8px] font-bold uppercase tracking-tighter">{voice}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="permissions"
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -20, opacity: 0 }}
                    >
                      <SystemControls />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              {!isEditingProfile && (
                <p className="text-[10px] text-zinc-600 italic text-center mt-6">
                  Changes will apply on the next session.
                </p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* History Sidebar */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute top-0 right-0 bottom-0 w-full max-w-md bg-[#0a0a0a] border-l border-white/10 z-50 flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-pink-500" />
                  <h2 className="text-xl font-bold tracking-tight uppercase italic">History</h2>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearHistory}
                    className="text-zinc-500 hover:text-red-400 hover:bg-red-400/10"
                    title="Clear History"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowHistory(false)}
                    className="text-zinc-500 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-6 h-6" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600 space-y-4">
                    <Sparkles className="w-12 h-12 opacity-20" />
                    <p className="text-sm font-medium italic">"No memories yet... let's make some."</p>
                  </div>
                ) : (
                  history.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex flex-col max-w-[85%]",
                        msg.isModel ? "mr-auto" : "ml-auto items-end"
                      )}
                    >
                      <div className={cn(
                        "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                        msg.isModel 
                          ? "bg-zinc-900 text-zinc-200 rounded-tl-none border border-white/5" 
                          : "bg-pink-600 text-white rounded-tr-none shadow-lg shadow-pink-500/20"
                      )}>
                        {msg.text}
                      </div>
                      <span className="text-[10px] font-mono text-zinc-600 mt-1 uppercase tracking-tighter">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </motion.div>
                  ))
                )}
                <div ref={historyEndRef} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Footer Info */}
      <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end z-10">
        <div className="flex gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Audio In</span>
            <span className="text-xs font-medium">16kHz PCM16</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Audio Out</span>
            <span className="text-xs font-medium">24kHz PCM16</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-zinc-500">
          <Globe className="w-4 h-4" />
          <span className="text-[10px] font-mono uppercase tracking-widest">Real-time Session</span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}} />
    </div>
  );
}

