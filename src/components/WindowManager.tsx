import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pin, PinOff, Maximize2, Minimize2, Move } from 'lucide-react';
import { WindowState } from '../types';
import { cn } from '../lib/utils';

interface WindowManagerProps {
  windows: WindowState[];
  onClose: (id: string) => void;
  onUpdate: (id: string, updates: Partial<WindowState>) => void;
  onFocus: (id: string) => void;
}

export const WindowManager: React.FC<WindowManagerProps> = ({
  windows,
  onClose,
  onUpdate,
  onFocus,
}) => {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <AnimatePresence>
        {windows.map((win) => (
          <WindowItem
            key={win.id}
            window={win}
            onClose={() => onClose(win.id)}
            onUpdate={(updates) => onUpdate(win.id, updates)}
            onFocus={() => onFocus(win.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

interface WindowItemProps {
  window: WindowState;
  onClose: () => void;
  onUpdate: (updates: Partial<WindowState>) => void;
  onFocus: () => void;
}

const WindowItem: React.FC<WindowItemProps> = ({
  window,
  onClose,
  onUpdate,
  onFocus,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = (_: any, info: any) => {
    if (window.isPinned) return;
    onUpdate({ x: window.x + info.offset.x, y: window.y + info.offset.y });
  };

  return (
    <motion.div
      ref={windowRef}
      initial={{ opacity: 0, scale: 0.9, x: window.x, y: window.y }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        x: window.x, 
        y: window.y,
        width: window.width,
        height: window.height,
        zIndex: window.isPinned ? 1000 + window.zIndex : window.zIndex 
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      drag={!window.isPinned}
      dragMomentum={false}
      onDragStart={onFocus}
      onDragEnd={handleDragEnd}
      className={cn(
        "absolute pointer-events-auto bg-white border border-zinc-200 rounded-xl shadow-2xl flex flex-col overflow-hidden",
        window.isPinned && "border-blue-500 ring-2 ring-blue-500/20"
      )}
      style={{ width: window.width, height: window.height }}
    >
      {/* Header */}
      <div 
        className="h-10 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between px-3 cursor-move select-none shrink-0"
        onMouseDown={onFocus}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Move className="w-4 h-4 text-zinc-400 shrink-0" />
          <span className="text-sm font-medium text-zinc-700 truncate">{window.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onUpdate({ isPinned: !window.isPinned })}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              window.isPinned ? "text-blue-600 bg-blue-50" : "text-zinc-500 hover:bg-zinc-200"
            )}
            title={window.isPinned ? "Unpin window" : "Pin window"}
          >
            {window.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 prose prose-sm max-w-none bg-white">
        {window.mimeType?.startsWith('image/') ? (
          <div className="flex items-center justify-center min-h-full">
            <img 
              src={window.content} 
              alt={window.name} 
              className="max-w-full h-auto rounded-lg shadow-sm"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : window.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (
          <div 
            className="text-zinc-800 font-sans leading-relaxed"
            dangerouslySetInnerHTML={{ __html: window.content }}
          />
        ) : (
          <div className="whitespace-pre-wrap text-zinc-800 font-sans leading-relaxed">
            {window.content}
          </div>
        )}
      </div>

      {/* Footer / Pin Button */}
      <div className="p-2 border-t border-zinc-100 flex justify-center bg-zinc-50/50">
        <button
          onClick={() => onUpdate({ isPinned: !window.isPinned })}
          className={cn(
            "text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full border transition-all",
            window.isPinned 
              ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20" 
              : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400"
          )}
        >
          {window.isPinned ? "Pinned Here" : "Pin Here"}
        </button>
      </div>

      {/* Resize Handle */}
      {!window.isPinned && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-zinc-200/50 hover:bg-zinc-400/50 transition-colors rounded-tl-md"
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsResizing(true);
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = window.width;
            const startHeight = window.height;

            const onMouseMove = (moveEvent: MouseEvent) => {
              onUpdate({
                width: Math.max(200, startWidth + (moveEvent.clientX - startX)),
                height: Math.max(150, startHeight + (moveEvent.clientY - startY)),
              });
            };

            const onMouseUp = () => {
              setIsResizing(false);
              window.removeEventListener('mousemove', onMouseMove);
              window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
          }}
        />
      )}
    </motion.div>
  );
};
