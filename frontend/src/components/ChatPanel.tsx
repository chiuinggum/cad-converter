import React, { useState } from "react";
import { Send, Sparkles, MessageSquare, Paperclip, X, Bot, User, RefreshCw, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { StreamTypewriter } from "./StreamTypewriter";
import { ChatHistoryMenu } from "./ChatHistoryMenu";
import { WorkspaceHistoryEntry } from "../utils/workspaceStorage";

export type ChatMessageKind = "text" | "pipeline_header" | "pipeline_step";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachment?: string;
  imageUrls?: string[];
  kind?: ChatMessageKind;
  stepIndex?: number;
  stepName?: string;
  stepStatus?: "running" | "success" | "error";
  streamActive?: boolean;
  pipelineSteps?: string[];
}

interface ChatPanelProps {
  chatHistory: ChatMessage[];
  onSendMessage: (text: string, attachedImage?: string) => void;
  isChatResponding: boolean;
  pipelineActiveStep?: number | null;
  pipelineRunning?: boolean;
  historyEntries?: WorkspaceHistoryEntry[];
  onRestoreHistory?: (entry: WorkspaceHistoryEntry) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  chatHistory,
  onSendMessage,
  isChatResponding,
  pipelineRunning = false,
  historyEntries = [],
  onRestoreHistory,
}) => {
  const [inputText, setInputText] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatHistory, pipelineRunning]);

  const handleSend = () => {
    if (!inputText.trim() && !attachedImage) return;
    onSendMessage(inputText, attachedImage || undefined);
    setInputText("");
    setAttachedImage(null);
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => setAttachedImage(event.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const visibleMessages = chatHistory.filter((msg) => {
    if (pipelineRunning && msg.kind === "pipeline_step") return false;
    return true;
  });

  const renderGeneratingBanner = () => (
    <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 via-white to-orange-50 p-3 shadow-sm pipeline-shimmer">
      <div className="flex items-center gap-2">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
          className="p-1 rounded-full bg-orange-100"
        >
          <Loader2 className="w-3.5 h-3.5 text-orange-600" />
        </motion.div>
        <span className="text-[11px] font-bold uppercase tracking-wide text-orange-800">
          Generating 3D model…
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1.5">
        Pipeline is running. Detailed logs appear in the panel below.
      </p>
    </div>
  );

  const renderPipelineStep = (msg: ChatMessage) => {
    const isRunning = msg.stepStatus === "running";
    const isError = msg.stepStatus === "error";
    return (
      <div
        className={`rounded-xl border p-3 text-xs shadow-sm ${
          isRunning
            ? "border-orange-300 bg-orange-50/60 ring-2 ring-orange-200/60 pipeline-glow"
            : isError
            ? "border-red-200 bg-red-50/50"
            : "border-emerald-200 bg-white"
        }`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 text-orange-600 animate-spin" />
          ) : isError ? (
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          )}
          <span className="font-bold text-slate-800 text-[11px]">
            {msg.stepName || `Step ${msg.stepIndex}`}
          </span>
        </div>
        <p className="text-slate-600 leading-relaxed whitespace-pre-line font-sans max-h-[280px] overflow-y-auto">
          <StreamTypewriter text={msg.content} active={Boolean(msg.streamActive)} />
        </p>
        {msg.imageUrls && msg.imageUrls.length > 0 && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {msg.imageUrls.map((url, idx) => (
              <a
                key={`${msg.id}-img-${idx}`}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-slate-200 overflow-hidden bg-white hover:ring-2 hover:ring-orange-200 transition-shadow"
              >
                <img
                  src={url}
                  alt={`Pipeline render ${idx + 1}`}
                  className="w-full h-auto max-h-48 object-contain bg-slate-50"
                />
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden flex flex-col h-full min-h-0 text-left">
      <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 text-orange-600 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-800 tracking-wide font-sans uppercase truncate">
            Co-Pilot Chat
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onRestoreHistory && (
            <ChatHistoryMenu
              entries={historyEntries}
              onRestore={onRestoreHistory}
              disabled={pipelineRunning}
            />
          )}
          {pipelineRunning && (
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="text-[9px] font-mono font-bold text-orange-600 uppercase"
            >
              Live
            </motion.span>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 min-h-[160px] bg-slate-50/40"
      >
        <AnimatePresence initial={false}>
          {pipelineRunning && renderGeneratingBanner()}

          {visibleMessages.length > 0 ? (
            visibleMessages.map((msg) => {
              const isBot = msg.role === "assistant";
              if (msg.kind === "pipeline_header") {
                if (pipelineRunning) return null;
                return (
                  <motion.div key={msg.id} layout className="self-start max-w-full">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-slate-600">
                      {msg.content}
                    </div>
                  </motion.div>
                );
              }
              if (msg.kind === "pipeline_step") {
                return (
                  <motion.div key={msg.id} layout className="self-start max-w-[92%]">
                    {renderPipelineStep(msg)}
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 max-w-[85%] text-left ${isBot ? "self-start" : "self-end flex-row-reverse"}`}
                >
                  <div
                    className={`p-1.5 h-7 w-7 rounded-md flex items-center justify-center flex-shrink-0 border ${
                      isBot
                        ? "bg-orange-50 text-orange-700 border-orange-200"
                        : "bg-slate-100 text-slate-650 border-slate-200"
                    }`}
                  >
                    {isBot ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div
                    className={`p-3 rounded-xl text-xs leading-relaxed flex flex-col gap-2 shadow-2xs ${
                      isBot
                        ? "bg-white border border-slate-205 text-slate-650"
                        : "bg-orange-600 font-medium text-white"
                    }`}
                  >
                    <p className="whitespace-pre-line select-text font-sans">{msg.content}</p>
                    {msg.attachment && (
                      <div className="mt-2 text-left">
                        <img
                          src={msg.attachment}
                          alt="attached"
                          className="max-h-24 rounded border border-slate-200 object-contain"
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          ) : !pipelineRunning ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center select-none">
              <Sparkles className="w-6 h-6 text-orange-500 mb-2 animate-bounce" />
              <span className="text-[11px] font-mono font-bold text-slate-450 uppercase tracking-widest">
                Co-Pilot Conversation
              </span>
              <span className="text-[10px] text-slate-400 mt-1.5 max-w-xs font-sans">
                Enter a prompt to generate a model, or use the history icon to restore a past session.
              </span>
            </div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="p-3 border-t border-slate-200 bg-white flex flex-col gap-2">
        {attachedImage && (
          <div className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-200 max-w-max">
            <img src={attachedImage} alt="Preview" className="h-8 w-8 object-cover rounded border" />
            <button onClick={() => setAttachedImage(null)} className="p-1 hover:bg-slate-150 rounded">
              <X className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAttachClick}
            disabled={isChatResponding}
            className="p-2 border border-slate-200 rounded-lg bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition disabled:opacity-55"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          <input
            type="text"
            placeholder="Edit the model, e.g. change outer diameter to 100 mm…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={isChatResponding}
            className="flex-1 px-3 py-1.5 border border-slate-200 bg-white focus:outline-none focus:border-orange-600 rounded-lg text-xs text-slate-750 placeholder-slate-400"
          />
          <button
            onClick={handleSend}
            disabled={isChatResponding || (!inputText.trim() && !attachedImage)}
            className="p-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-100 disabled:text-slate-400 rounded-lg text-white transition"
          >
            {isChatResponding ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
