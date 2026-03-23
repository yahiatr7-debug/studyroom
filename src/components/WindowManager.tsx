import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Pin, PinOff, Maximize2, Minimize2, Move } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { WindowState } from '../types';
import { cn } from '../lib/utils';

interface WindowManagerProps {
  windows: WindowState[];
  onClose: (id: string) => void;
  onUpdate: (id: string, updates: Partial<WindowState>) => void;
  onFocus: (id: string) => void;
  onContentChange: (id: string, content: string) => void;
}

export const WindowManager: React.FC<WindowManagerProps> = ({
  windows,
  onClose,
  onUpdate,
  onFocus,
  onContentChange,
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
            onContentChange={(content) => onContentChange(win.id, content)}
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
  onContentChange: (content: string) => void;
}

const WindowItem: React.FC<WindowItemProps> = ({
  window: win,
  onClose,
  onUpdate,
  onFocus,
  onContentChange,
}) => {
  const [isResizing, setIsResizing] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);

  const handleDragEnd = (_: any, info: any) => {
    if (win.isPinned) return;
    onUpdate({ x: win.x + info.offset.x, y: win.y + info.offset.y });
  };

  const isRichText = win.mimeType === 'text/html' || win.mimeType === 'text/plain' || !win.mimeType;
  const isCode = win.mimeType?.includes('javascript') || win.mimeType?.includes('typescript') || win.mimeType?.includes('css') || win.mimeType?.includes('json');

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, false] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['link', 'image'],
      ['clean']
    ],
  };

  return (
    <motion.div
      ref={windowRef}
      initial={{ opacity: 0, scale: 0.9, x: win.x, y: win.y }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        x: win.x, 
        y: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.isPinned ? 1000 + win.zIndex : win.zIndex 
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      drag={!win.isPinned}
      dragMomentum={false}
      onDragStart={onFocus}
      onDragEnd={handleDragEnd}
      className={cn(
        "absolute pointer-events-auto bg-white border border-zinc-200 rounded-xl shadow-2xl flex flex-col overflow-hidden",
        win.isPinned && "border-blue-500 ring-2 ring-blue-500/20"
      )}
      style={{ width: win.width, height: win.height }}
    >
      {/* Header */}
      <div 
        className="h-10 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between px-3 cursor-move select-none shrink-0"
        onMouseDown={onFocus}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <Move className="w-4 h-4 text-zinc-400 shrink-0" />
          <span className="text-sm font-medium text-zinc-700 truncate">{win.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onUpdate({ isPinned: !win.isPinned })}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              win.isPinned ? "text-blue-600 bg-blue-50" : "text-zinc-500 hover:bg-zinc-200"
            )}
            title={win.isPinned ? "Unpin window" : "Pin window"}
          >
            {win.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
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
      <div className="flex-1 overflow-hidden bg-white relative flex flex-col">
        {win.mimeType?.startsWith('image/') ? (
          <div className="absolute inset-0 overflow-auto p-4 flex items-center justify-center">
            <img 
              src={win.content} 
              alt={win.name} 
              className="max-w-full h-auto rounded-lg shadow-sm"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : win.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? (
          <div 
            className="absolute inset-0 overflow-auto p-4 text-zinc-800 font-sans leading-relaxed"
            dangerouslySetInnerHTML={{ __html: win.content }}
          />
        ) : isRichText && !isCode ? (
          <div className="flex-1 flex flex-col overflow-hidden quill-container" onMouseDown={onFocus}>
            <ReactQuill
              theme="snow"
              value={win.content}
              onChange={onContentChange}
              modules={modules}
              className="flex-1 flex flex-col overflow-hidden"
            />
          </div>
        ) : (
          <textarea
            value={win.content}
            onChange={(e) => onContentChange(e.target.value)}
            onFocus={onFocus}
            className="absolute inset-0 w-full h-full p-4 bg-transparent border-none outline-none resize-none font-mono leading-relaxed text-zinc-800 focus:ring-0 text-sm"
            spellCheck={false}
          />
        )}
      </div>

      {/* Footer / Pin Button */}
      <div className="p-2 border-t border-zinc-100 flex justify-center bg-zinc-50/50">
        <button
          onClick={() => onUpdate({ isPinned: !win.isPinned })}
          className={cn(
            "text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full border transition-all",
            win.isPinned 
              ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20" 
              : "bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400"
          )}
        >
          {win.isPinned ? "Pinned Here" : "Pin Here"}
        </button>
      </div>

      {/* Resize Handle */}
      {!win.isPinned && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-zinc-200/50 hover:bg-zinc-400/50 transition-colors rounded-tl-md z-10"
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsResizing(true);
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = win.width;
            const startHeight = win.height;

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
