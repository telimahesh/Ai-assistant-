/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, Power, Globe, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LiveSession, SessionState } from "@/lib/live-session";
import { cn } from "@/lib/utils";

export default function App() {
  const [state, setState] = useState<SessionState>("disconnected");
  const [volume, setVolume] = useState(0);
  const sessionRef = useRef<LiveSession | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    sessionRef.current = new LiveSession(
      (newState) => setState(newState),
      (text, isModel) => console.log(`${isModel ? "Zoya" : "You"}: ${text}`)
    );

    return () => {
      sessionRef.current?.disconnect();
      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
    };
  }, []);

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
      await sessionRef.current?.connect();
    } else {
      sessionRef.current?.disconnect();
    }
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
        <div>
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
        
        <div className="flex gap-4">
          <div className="flex flex-col items-end">
            <span className={cn("text-[10px] font-mono uppercase tracking-widest transition-colors duration-300", getStatusColor())}>
              System Status
            </span>
            <span className="text-sm font-medium">{getStatusText()}</span>
          </div>
        </div>
      </div>

      {/* Main Interaction Area */}
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
                "I'm all ears, babe. What's on your mind?"
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
      `}} />
    </div>
  );
}

