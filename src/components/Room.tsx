import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  FolderPlus, 
  FilePlus, 
  MoreVertical, 
  Pin, 
  PinOff, 
  ChevronRight, 
  ChevronDown, 
  FileText, 
  Folder, 
  Share2, 
  Settings, 
  LogOut, 
  UserPlus,
  Trash2,
  Edit2,
  ExternalLink,
  Upload,
  FileCode,
  Type as TypeIcon,
  Image as ImageIcon,
  File as FileIcon,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Send,
  AtSign,
  Reply,
  UserCog,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  Save
} from 'lucide-react';
import { ChatMessage } from '../types';
import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  where 
} from 'firebase/firestore';
import { db, auth, logOut, handleFirestoreError, OperationType } from '../firebase';
import { Room as RoomType, RoomItem, Role, WindowState } from '../types';
import { cn } from '../lib/utils';
import { nanoid } from 'nanoid';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DndContext, 
  useDraggable, 
  useDroppable, 
  DragEndEvent, 
  DragStartEvent, 
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  verticalListSortingStrategy,
  useSortable 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface RoomProps {
  room: RoomType;
  userRole: Role;
}

interface UploadTask {
  id: string;
  name: string;
  progress: number;
  status: 'processing' | 'uploading' | 'completed' | 'error';
  error?: string;
}

export const Room: React.FC<RoomProps> = ({ room, userRole }) => {
  const [items, setItems] = useState<RoomItem[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [hoverPreview, setHoverPreview] = useState<{ id: string; name: string; content: string; mimeType?: string; x: number; y: number } | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [uploads, setUploads] = useState<UploadTask[]>([]);

  const updateUpload = (id: string, updates: Partial<UploadTask>) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  };

  const removeUpload = (id: string) => {
    setTimeout(() => {
      setUploads(prev => prev.filter(u => u.id !== id));
    }, 5000);
  };

  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState<{ type: 'file' | 'group', parentId: string | null } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemContent, setNewItemContent] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<RoomItem | null>(null);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [pingCount, setPingCount] = useState(0);
  const [mentionSearch, setMentionSearch] = useState<{ query: string; index: number } | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Settings Modal State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [roomName, setRoomName] = useState(room.name);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const canEdit = userRole === 'owner' || userRole === 'editor';

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const q = query(
      collection(db, 'rooms', room.id, 'items'),
      orderBy('pinned', 'desc'),
      orderBy('order', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoomItem));
      setItems(newItems);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${room.id}/items`);
    });

    return () => unsubscribe();
  }, [room.id]);

  useEffect(() => {
    const q = query(
      collection(db, 'rooms', room.id, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setMessages(newMessages);

      // Handle pings for new messages
      if (!chatOpen && snapshot.docChanges().length > 0) {
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const msg = change.doc.data() as ChatMessage;
            if (msg.senderId !== auth.currentUser?.uid) {
              const isMentioned = msg.mentions?.includes(auth.currentUser?.uid || '');
              const isReplyToMe = msg.replyTo && newMessages.find(m => m.id === msg.replyTo)?.senderId === auth.currentUser?.uid;
              
              if (isMentioned || isReplyToMe) {
                setPingCount(prev => prev + 1);
              }
            }
          }
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${room.id}/messages`);
    });

    return () => unsubscribe();
  }, [room.id, chatOpen]);

  useEffect(() => {
    if (chatOpen) {
      setPingCount(0);
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatOpen, messages]);

  const sendMessage = async () => {
    if (!chatMessage.trim()) return;

    const mentions = chatMessage.match(/@\[([^\]]+)\]\(([^)]+)\)/g)?.map(m => m.match(/\(([^)]+)\)/)?.[1] || '') || [];

    try {
      await addDoc(collection(db, 'rooms', room.id, 'messages'), {
        senderId: auth.currentUser?.uid,
        senderName: auth.currentUser?.displayName || 'Anonymous',
        text: chatMessage,
        mentions,
        replyTo: replyTo?.id || null,
        createdAt: serverTimestamp(),
      });
      setChatMessage('');
      setReplyTo(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `rooms/${room.id}/messages`);
    }
  };

  const handleChatInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setChatMessage(value);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol !== -1 && (lastAtSymbol === 0 || textBeforeCursor[lastAtSymbol - 1] === ' ')) {
      const query = textBeforeCursor.substring(lastAtSymbol + 1);
      if (!query.includes(' ')) {
        setMentionSearch({ query, index: lastAtSymbol });
      } else {
        setMentionSearch(null);
      }
    } else {
      setMentionSearch(null);
    }
  };

  const insertMention = (memberId: string, memberName: string) => {
    if (!mentionSearch) return;
    const before = chatMessage.substring(0, mentionSearch.index);
    const after = chatMessage.substring(mentionSearch.index + mentionSearch.query.length + 1);
    setChatMessage(`${before}@[${memberName}](${memberId})${after}`);
    setMentionSearch(null);
  };

  const updateRoomSettings = async () => {
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        name: roomName,
      });
      setNotification({ message: 'Room settings updated', type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  const updateMemberRole = async (memberId: string, newRole: Role) => {
    try {
      const newMembers = { ...room.members, [memberId]: newRole };
      await updateDoc(doc(db, 'rooms', room.id), {
        members: newMembers,
      });
      setNotification({ message: 'Member role updated', type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  const removeMember = async (memberId: string) => {
    if (memberId === room.ownerId) return;
    try {
      const newMembers = { ...room.members };
      delete newMembers[memberId];
      await updateDoc(doc(db, 'rooms', room.id), {
        members: newMembers,
      });
      setNotification({ message: 'Member removed', type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}`);
    }
  };

  const toggleGroup = (groupId: string) => {
    const next = new Set(expandedGroups);
    if (next.has(groupId)) next.delete(groupId);
    else next.add(groupId);
    setExpandedGroups(next);
  };

  const addItem = async () => {
    if (!isAddItemModalOpen || !newItemName.trim()) return;

    try {
      await addDoc(collection(db, 'rooms', room.id, 'items'), {
        type: isAddItemModalOpen.type,
        parentId: isAddItemModalOpen.parentId,
        name: newItemName,
        content: newItemContent,
        mimeType: isAddItemModalOpen.type === 'file' ? 'text/plain' : undefined,
        pinned: false,
        order: items.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewItemName('');
      setNewItemContent('');
      setIsAddItemModalOpen(null);
      setNotification({ message: `${isAddItemModalOpen.type === 'file' ? 'File' : 'Group'} added successfully`, type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `rooms/${room.id}/items`);
    }
  };

  const processFile = async (file: File, parentId: string | null) => {
    const uploadId = Math.random().toString(36).substring(7);
    const newUpload: UploadTask = {
      id: uploadId,
      name: file.name,
      progress: 0,
      status: 'processing'
    };
    setUploads(prev => [...prev, newUpload]);

    try {
      let content = '';
      const mimeType = file.type;

      if (mimeType.startsWith('image/')) {
        if (file.size > 800 * 1024) {
          updateUpload(uploadId, { status: 'error', error: "Image too large (max 800KB)" });
          removeUpload(uploadId);
          return;
        }
        content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onprogress = (e) => {
            if (e.lengthComputable) {
              updateUpload(uploadId, { progress: Math.round((e.loaded / e.total) * 50) });
            }
          };
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Failed to read image"));
          reader.readAsDataURL(file);
        });
      } else if (mimeType === 'application/pdf') {
        updateUpload(uploadId, { progress: 10 });
        const arrayBuffer = await file.arrayBuffer();
        updateUpload(uploadId, { progress: 30 });
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          text += textContent.items.map((item: any) => item.str).join(' ') + '\n\n';
          updateUpload(uploadId, { progress: 30 + Math.round((i / pdf.numPages) * 40) });
        }
        content = text;
      } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        updateUpload(uploadId, { progress: 20 });
        const arrayBuffer = await file.arrayBuffer();
        updateUpload(uploadId, { progress: 50 });
        const result = await mammoth.convertToHtml({ arrayBuffer });
        content = result.value; // HTML content
      } else {
        updateUpload(uploadId, { progress: 20 });
        content = await file.text();
      }

      updateUpload(uploadId, { status: 'uploading', progress: 80 });

      await addDoc(collection(db, 'rooms', room.id, 'items'), {
        type: 'file',
        parentId: parentId,
        name: file.name,
        content: content,
        mimeType: mimeType,
        pinned: false,
        order: items.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      updateUpload(uploadId, { status: 'completed', progress: 100 });
      removeUpload(uploadId);
    } catch (err) {
      console.error("Error reading file:", err);
      updateUpload(uploadId, { status: 'error', error: "Failed to process file" });
      removeUpload(uploadId);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, parentId: string | null = null) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    
    // Process all files simultaneously
    await Promise.all(files.map(file => processFile(file, parentId)));
    e.target.value = '';
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (!canEdit) return;

    const files = Array.from(e.dataTransfer.files) as File[];
    // Process all files simultaneously
    await Promise.all(files.map(file => {
      if (file instanceof File) {
        return processFile(file, null);
      }
      return Promise.resolve();
    }));
  };

  const deleteItem = async (itemId: string) => {
    try {
      await deleteDoc(doc(db, 'rooms', room.id, 'items', itemId));
      setDeleteConfirmation(null);
      setNotification({ message: "Item deleted successfully", type: 'success' });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `rooms/${room.id}/items/${itemId}`);
    }
  };

  const togglePin = async (item: RoomItem) => {
    try {
      await updateDoc(doc(db, 'rooms', room.id, 'items', item.id), {
        pinned: !item.pinned,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}/items/${item.id}`);
    }
  };

  const openFile = (item: RoomItem) => {
    if (item.type !== 'file') return;
    
    // Check if already open
    if (windows.find(w => w.itemId === item.id)) {
      setWindows(prev => prev.map(w => w.itemId === item.id ? { ...w, zIndex: Math.max(...prev.map(win => win.zIndex)) + 1 } : w));
      return;
    }

    const newWindow: WindowState = {
      id: nanoid(),
      itemId: item.id,
      name: item.name,
      content: item.content || '',
      mimeType: item.mimeType,
      x: 100 + (windows.length * 40),
      y: 100 + (windows.length * 40),
      width: 400,
      height: 300,
      isPinned: false,
      zIndex: windows.length > 0 ? Math.max(...windows.map(w => w.zIndex)) + 1 : 1,
    };
    setWindows([...windows, newWindow]);
  };

  const closeWindow = (id: string) => {
    setWindows(windows.filter(w => w.id !== id));
  };

  const updateWindow = (id: string, updates: Partial<WindowState>) => {
    setWindows(windows.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const focusWindow = (id: string) => {
    const maxZ = Math.max(...windows.map(w => w.zIndex), 0);
    setWindows(windows.map(w => w.id === id ? { ...w, zIndex: maxZ + 1 } : w));
  };

  const handleDragStart = (event: DragStartEvent) => {
    if (!canEdit) return;
    const { active } = event;
    const item = items.find(i => i.id === active.id);
    if (item) setActiveDragItem(item);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragItem(null);
    if (!canEdit) return;
    
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    if (activeId === overId) return;

    const activeItem = items.find(i => i.id === activeId);
    const overItem = items.find(i => i.id === overId);

    if (!activeItem) return;

    // Case 1: Dropped on a group (move into group)
    if (overItem && overItem.type === 'group' && activeId !== overId) {
      try {
        await updateDoc(doc(db, 'rooms', room.id, 'items', activeId), {
          parentId: overId,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}/items/${activeId}`);
      }
      return;
    }

    // Case 2: Dropped on explorer root
    if (overId === 'explorer-root') {
      try {
        await updateDoc(doc(db, 'rooms', room.id, 'items', activeId), {
          parentId: null,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `rooms/${room.id}/items/${activeId}`);
      }
      return;
    }

    // Case 3: Reordering (dropped on another item at the same level)
    if (overItem && activeItem.parentId === overItem.parentId) {
      const sameLevelItems = items
        .filter(i => i.parentId === activeItem.parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      const oldIndex = sameLevelItems.findIndex(i => i.id === activeId);
      const newIndex = sameLevelItems.findIndex(i => i.id === overId);

      if (oldIndex !== newIndex) {
        const newOrder = arrayMove(sameLevelItems, oldIndex, newIndex) as RoomItem[];
        
        // Update all items in this level with new order
        for (let i = 0; i < newOrder.length; i++) {
          const item = newOrder[i];
          if (item.order !== i) {
            try {
              await updateDoc(doc(db, 'rooms', room.id, 'items', item.id), {
                order: i,
                updatedAt: serverTimestamp(),
              });
            } catch (err) {
              console.error("Error updating order:", err);
            }
          }
        }
      }
    }
  };

  const renderItems = (parentId: string | null = null, level: number = 0) => {
    const filtered = items
      .filter(item => item.parentId === parentId)
      .sort((a, b) => {
        // Sort pinned items to the top
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        // Then sort by order
        return (a.order || 0) - (b.order || 0);
      });
    
    return (
      <SortableContext 
        items={filtered.map(i => i.id)} 
        strategy={verticalListSortingStrategy}
      >
        <div className={cn("flex flex-col gap-1", level > 0 && "ml-4 border-l border-zinc-100 pl-2")}>
          {filtered.map(item => (
            <DraggableRoomItem 
              key={item.id} 
              item={item} 
              level={level}
              items={items}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              openFile={openFile}
              setHoverPreview={setHoverPreview}
              canEdit={canEdit}
              togglePin={togglePin}
              setIsAddItemModalOpen={setIsAddItemModalOpen}
              setDeleteConfirmation={setDeleteConfirmation}
              renderItems={renderItems}
            />
          ))}
        </div>
      </SortableContext>
    );
  };

  return (
    <div 
      className="flex flex-col h-screen bg-zinc-50 overflow-hidden font-sans relative"
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleFileDrop}
    >
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[500] bg-blue-600/10 backdrop-blur-sm border-4 border-dashed border-blue-600 m-4 rounded-3xl flex flex-col items-center justify-center pointer-events-none"
          >
            <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center text-white mb-4 shadow-2xl">
              <Upload className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-blue-600">Drop files to upload</h2>
            <p className="text-blue-500 font-bold">They will be added to the current room</p>
          </motion.div>
        )}
      </AnimatePresence>

      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Header */}
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center justify-between px-6 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-zinc-900 leading-none">{room.name}</h1>
            <p className="text-xs text-zinc-500 mt-1">
              {room.ownerId === auth.currentUser?.uid ? 'Owner' : userRole.charAt(0).toUpperCase() + userRole.slice(1)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsInviteModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Invite
          </button>
          {userRole === 'owner' && (
            <button 
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Room Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
          <button 
            onClick={() => logOut()}
            className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar / Explorer */}
        <aside className="w-80 bg-white border-r border-zinc-200 flex flex-col shrink-0">
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Explorer</h2>
            {canEdit && (
              <div className="flex gap-1">
                <button 
                  onClick={() => setIsAddItemModalOpen({ type: 'group', parentId: null })}
                  className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-md transition-colors"
                  title="New Group"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setIsAddItemModalOpen({ type: 'file', parentId: null })}
                  className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-md transition-colors"
                  title="New File"
                >
                  <FilePlus className="w-4 h-4" />
                </button>
                <label className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-md transition-colors cursor-pointer" title="Import File">
                  <Upload className="w-4 h-4" />
                  <input type="file" multiple className="hidden" onChange={(e) => handleFileUpload(e)} />
                </label>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.some(i => i.pinned) && (
              <div className="p-4 border-b border-zinc-100 bg-blue-50/10">
                <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Pin className="w-3 h-3" />
                  Pinned Items
                </h3>
                <div className="space-y-1">
                  {items.filter(i => i.pinned).map(item => (
                    <div 
                      key={`pinned-${item.id}`}
                      className="flex items-center gap-2 p-2 rounded-lg bg-white border border-blue-100 hover:bg-blue-50 cursor-pointer transition-all group shadow-sm"
                      onClick={() => {
                        if (item.type === 'file') openFile(item);
                        else toggleGroup(item.id);
                      }}
                    >
                      {item.type === 'group' ? (
                        <Folder className="w-4 h-4 text-amber-400 fill-amber-400" />
                      ) : item.mimeType?.startsWith('image/') ? (
                        <ImageIcon className="w-4 h-4 text-purple-500" />
                      ) : item.mimeType === 'application/pdf' ? (
                        <FileIcon className="w-4 h-4 text-red-500" />
                      ) : (
                        <FileText className="w-4 h-4 text-blue-500" />
                      )}
                      <span className="flex-1 text-sm font-medium text-zinc-700 truncate">
                        {item.name}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); togglePin(item); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-100 text-blue-600 transition-opacity"
                        title="Unpin"
                      >
                        <PinOff className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <DroppableExplorerRoot>
              {renderItems(null)}
            </DroppableExplorerRoot>
          </div>
        </aside>

        {/* Main Workspace */}
        <section className="flex-1 relative bg-zinc-100/50 overflow-hidden">
          {/* Multi-Window Layer */}
          <WindowManager 
            windows={windows} 
            onClose={closeWindow} 
            onUpdate={updateWindow} 
            onFocus={focusWindow}
          />

          {/* Empty State Background */}
          {windows.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20">
              <div className="w-32 h-32 bg-zinc-200 rounded-full flex items-center justify-center mb-4">
                <FileText className="w-16 h-16 text-zinc-400" />
              </div>
              <p className="text-zinc-500 font-medium">Select a file to open it in a window</p>
            </div>
          )}

          {/* Upload Progress Overlay */}
          {uploads.length > 0 && (
            <div className="absolute bottom-6 right-6 z-[100] w-80 space-y-2">
              <AnimatePresence>
                {uploads.map(upload => (
                  <motion.div
                    key={upload.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-xl shadow-xl border border-zinc-200 p-4 overflow-hidden"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        {upload.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                        ) : upload.status === 'error' ? (
                          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                        ) : (
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                        )}
                        <span className="text-xs font-bold text-zinc-700 truncate">{upload.name}</span>
                      </div>
                      <span className="text-[10px] font-black text-zinc-400 uppercase">
                        {upload.status === 'processing' ? 'Processing' : 
                         upload.status === 'uploading' ? 'Uploading' : 
                         upload.status === 'completed' ? 'Done' : 'Error'}
                      </span>
                    </div>
                    
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <motion.div 
                        className={cn(
                          "h-full transition-all duration-300",
                          upload.status === 'error' ? "bg-red-500" : 
                          upload.status === 'completed' ? "bg-green-500" : "bg-blue-600"
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${upload.progress}%` }}
                      />
                    </div>
                    
                    {upload.error && (
                      <p className="text-[10px] text-red-500 mt-2 font-medium">{upload.error}</p>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Chat System */}
          <div className="absolute bottom-6 left-6 z-[100]">
            <AnimatePresence>
              {chatOpen ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="w-80 h-[450px] bg-white rounded-2xl shadow-2xl border border-zinc-200 flex flex-col overflow-hidden"
                >
                  {/* Chat Header */}
                  <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-bold text-zinc-900">Room Chat</span>
                    </div>
                    <button 
                      onClick={() => setChatOpen(false)}
                      className="p-1 hover:bg-zinc-200 rounded-md transition-colors"
                    >
                      <ChevronDown className="w-4 h-4 text-zinc-500" />
                    </button>
                  </div>

                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg) => (
                      <div 
                        key={msg.id} 
                        className={cn(
                          "flex flex-col gap-1",
                          msg.senderId === auth.currentUser?.uid ? "items-end" : "items-start"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase">{msg.senderName}</span>
                          {msg.mentions?.includes(auth.currentUser?.uid || '') && (
                            <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">MENTIONED</span>
                          )}
                        </div>
                        
                        {msg.replyTo && (
                          <div className="text-[10px] text-zinc-400 bg-zinc-50 p-2 rounded-lg border-l-2 border-zinc-200 mb-1 max-w-[90%] truncate">
                            <Reply className="w-3 h-3 inline mr-1" />
                            {messages.find(m => m.id === msg.replyTo)?.text || 'Original message deleted'}
                          </div>
                        )}

                        <div 
                          className={cn(
                            "group relative px-3 py-2 rounded-2xl text-sm max-w-[90%] break-words",
                            msg.senderId === auth.currentUser?.uid 
                              ? "bg-blue-600 text-white rounded-tr-none" 
                              : "bg-zinc-100 text-zinc-800 rounded-tl-none"
                          )}
                        >
                          {msg.text.split(/(@\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
                            const mentionMatch = part.match(/@\[([^\]]+)\]\(([^)]+)\)/);
                            if (mentionMatch) {
                              const [_, name, id] = mentionMatch;
                              return (
                                <span 
                                  key={i} 
                                  className={cn(
                                    "font-bold",
                                    id === auth.currentUser?.uid ? "underline decoration-2 underline-offset-2" : ""
                                  )}
                                >
                                  @{name}
                                </span>
                              );
                            }
                            return part;
                          })}
                          
                          <button 
                            onClick={() => setReplyTo(msg)}
                            className="absolute -right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-blue-600 transition-all"
                          >
                            <Reply className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input Area */}
                  <div className="p-4 border-t border-zinc-100 bg-zinc-50 relative">
                    {replyTo && (
                      <div className="absolute bottom-full left-0 right-0 bg-blue-50 p-2 border-t border-blue-100 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-2 text-blue-600 truncate">
                          <Reply className="w-3 h-3" />
                          Replying to <strong>{replyTo.senderName}</strong>
                        </div>
                        <button onClick={() => setReplyTo(null)} className="text-blue-400 hover:text-blue-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    {mentionSearch && (
                      <div className="absolute bottom-full left-4 right-4 bg-white rounded-xl shadow-2xl border border-zinc-200 mb-2 overflow-hidden max-h-40 overflow-y-auto z-50">
                        <div className="p-2 border-b border-zinc-100 bg-zinc-50 text-[10px] font-bold text-zinc-400 uppercase">Mention Member</div>
                        {Object.entries(room.members)
                          .filter(([id, _]) => id !== auth.currentUser?.uid)
                          .map(([id, role]) => (
                            <button
                              key={id}
                              onClick={() => insertMention(id, id.substring(0, 8))} // Placeholder for name if not available
                              className="w-full flex items-center gap-2 p-2 hover:bg-blue-50 text-left transition-colors"
                            >
                              <div className="w-6 h-6 bg-zinc-200 rounded-full flex items-center justify-center text-[10px] font-bold">
                                {id.substring(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 overflow-hidden">
                                <div className="text-xs font-bold text-zinc-700 truncate">{id}</div>
                                <div className="text-[10px] text-zinc-400 uppercase">{role}</div>
                              </div>
                            </button>
                          ))}
                      </div>
                    )}

                    <div className="flex items-end gap-2">
                      <textarea
                        value={chatMessage}
                        onChange={handleChatInputChange}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder="Type a message... (@ to mention)"
                        className="flex-1 bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none max-h-32"
                        rows={1}
                      />
                      <button 
                        onClick={sendMessage}
                        disabled={!chatMessage.trim()}
                        className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setChatOpen(true)}
                  className="w-14 h-14 bg-white rounded-2xl shadow-2xl border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-blue-600 hover:border-blue-200 transition-all relative group"
                >
                  <MessageSquare className="w-6 h-6" />
                  {pingCount > 0 && (
                    <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-lg animate-bounce">
                      {pingCount}
                    </span>
                  )}
                  <div className="absolute left-full ml-4 px-3 py-1.5 bg-zinc-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                    Room Chat
                  </div>
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      <DragOverlay>
        {activeDragItem ? (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-blue-200 shadow-xl opacity-80 pointer-events-none">
            {activeDragItem.type === 'group' ? (
              <Folder className="w-4 h-4 text-amber-400 fill-amber-400" />
            ) : activeDragItem.mimeType?.startsWith('image/') ? (
              <ImageIcon className="w-4 h-4 text-purple-500" />
            ) : activeDragItem.mimeType === 'application/pdf' ? (
              <FileIcon className="w-4 h-4 text-red-500" />
            ) : (
              <FileText className="w-4 h-4 text-blue-500" />
            )}
            <span className="text-sm font-medium text-zinc-700 truncate">
              {activeDragItem.name}
            </span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Hover Preview */}
      <AnimatePresence>
        {hoverPreview && (
          <motion.div
            key={`hover-preview-${hoverPreview.id}`}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="fixed z-[100] w-80 bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden pointer-events-none"
            style={{ 
              left: Math.min(window.innerWidth - 340, hoverPreview.x + 20), 
              top: Math.min(window.innerHeight - 250, hoverPreview.y + 20) 
            }}
          >
            <div className="bg-zinc-900 px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest truncate">{hoverPreview.name}</span>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-zinc-700" />
                <div className="w-2 h-2 rounded-full bg-zinc-700" />
                <div className="w-2 h-2 rounded-full bg-zinc-700" />
              </div>
            </div>
            <div className="p-4 bg-zinc-950 min-h-[120px] flex items-center justify-center">
              {hoverPreview.mimeType?.startsWith('image/') ? (
                <img 
                  src={hoverPreview.content} 
                  alt={hoverPreview.name} 
                  className="max-w-full max-h-[150px] object-contain rounded"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="font-mono text-[11px] text-zinc-300 leading-relaxed whitespace-pre-wrap break-words w-full">
                  {hoverPreview.content ? (
                    hoverPreview.content.slice(0, 500) + (hoverPreview.content.length > 500 ? '...' : '')
                  ) : (
                    <span className="text-zinc-600 italic">Empty file</span>
                  )}
                </div>
              )}
            </div>
            <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Quick Preview</span>
              <div className="flex items-center gap-1.5">
                <TypeIcon className="w-3 h-3 text-zinc-600" />
                <span className="text-[9px] text-zinc-500">{hoverPreview.content.length} chars</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {notification && (
          <motion.div
            key="notification"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold text-sm",
              notification.type === 'success' ? "bg-zinc-900 text-white" : "bg-red-600 text-white"
            )}
          >
            {notification.type === 'success' ? <div className="w-2 h-2 rounded-full bg-green-400" /> : <div className="w-2 h-2 rounded-full bg-white" />}
            {notification.message}
          </motion.div>
        )}

        {deleteConfirmation && (
          <motion.div 
            key="delete-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center text-red-600 mx-auto mb-6">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black text-zinc-900 mb-2">Delete Item?</h3>
                <p className="text-zinc-500 font-medium leading-relaxed">
                  This action cannot be undone. All contents within this item will also be removed.
                </p>
              </div>
              <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex gap-3">
                <button 
                  onClick={() => setDeleteConfirmation(null)}
                  className="flex-1 py-3 text-sm font-bold text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteItem(deleteConfirmation)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-2xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-500/20"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isAddItemModalOpen && (
          <motion.div 
            key="add-item-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <h3 className="text-xl font-bold text-zinc-900 mb-4">
                  Add New {isAddItemModalOpen.type === 'file' ? 'File' : 'Group'}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Name</label>
                    <input 
                      autoFocus
                      type="text" 
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      placeholder={`Enter ${isAddItemModalOpen.type} name...`}
                    />
                  </div>
                  {isAddItemModalOpen.type === 'file' && (
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Content</label>
                      <textarea 
                        value={newItemContent}
                        onChange={(e) => setNewItemContent(e.target.value)}
                        className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all h-32 resize-none"
                        placeholder="Enter file content..."
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-3">
                <button 
                  onClick={() => setIsAddItemModalOpen(null)}
                  className="px-4 py-2 text-sm font-semibold text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={addItem}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                >
                  Create {isAddItemModalOpen.type === 'file' ? 'File' : 'Group'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isInviteModalOpen && (
          <motion.div 
            key="invite-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                    <Share2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900">Share Room</h3>
                    <p className="text-sm text-zinc-500">Invite others to collaborate</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Invite Link</label>
                    <div className="flex gap-2">
                      <input 
                        readOnly
                        type="text" 
                        value={`${window.location.origin}/room/${room.id}`}
                        className="flex-1 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-600 focus:outline-none"
                      />
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/room/${room.id}`);
                          setNotification({ message: "Invite link copied to clipboard", type: 'success' });
                        }}
                        className="px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                    <p className="text-xs text-amber-700 leading-relaxed">
                      <strong>Note:</strong> Anyone with this link can view the room. To grant edit permissions, you'll need to manage member roles in the settings (coming soon).
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex justify-end">
                <button 
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-6 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isSettingsModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsModalOpen(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                    <Settings className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900">Room Settings</h2>
                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Manage room details and permissions</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="p-2 hover:bg-zinc-200 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>

              <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
                {/* Room Details */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-black text-zinc-400 uppercase tracking-widest">
                    <Edit2 className="w-3 h-3" />
                    General Details
                  </div>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="Room Name"
                      className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                    />
                    <button
                      onClick={updateRoomSettings}
                      className="px-6 py-3 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                  </div>
                </section>

                {/* Member Management */}
                <section className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-black text-zinc-400 uppercase tracking-widest">
                    <UserCog className="w-3 h-3" />
                    Member Management
                  </div>
                  <div className="border border-zinc-100 rounded-2xl overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-zinc-50 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-b border-zinc-100">
                        <tr>
                          <th className="px-6 py-4">Member</th>
                          <th className="px-6 py-4">Role</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {Object.entries(room.members).map(([id, role]) => (
                          <tr key={id} className="hover:bg-zinc-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-zinc-100 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-600">
                                  {id.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-zinc-900">{id === auth.currentUser?.uid ? 'You' : id.substring(0, 12) + '...'}</span>
                                  <span className="text-[10px] text-zinc-400 font-medium uppercase">{id}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {role === 'owner' ? (
                                  <span className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black uppercase">
                                    <ShieldAlert className="w-3 h-3" />
                                    Owner
                                  </span>
                                ) : (
                                  <select
                                    value={role}
                                    onChange={(e) => updateMemberRole(id, e.target.value as any)}
                                    className="bg-zinc-100 border-none rounded-lg px-2 py-1 text-[10px] font-black uppercase focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                                  >
                                    <option value="editor">Editor</option>
                                    <option value="viewer">Viewer</option>
                                  </select>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {role !== 'owner' && (
                                <button
                                  onClick={() => removeMember(id)}
                                  className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Remove Member"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end">
                <button
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="px-6 py-2 text-sm font-bold text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </DndContext>
    </div>
  );
};

const DroppableExplorerRoot = ({ children }: { children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'explorer-root',
  });

  return (
    <div 
      ref={setNodeRef} 
      className={cn(
        "flex-1 overflow-y-auto p-4 transition-colors",
        isOver && "bg-blue-50/50"
      )}
    >
      {children}
    </div>
  );
};

const DraggableRoomItem = ({ 
  item, 
  level, 
  items, 
  expandedGroups, 
  toggleGroup, 
  openFile, 
  setHoverPreview, 
  canEdit, 
  togglePin, 
  setIsAddItemModalOpen, 
  setDeleteConfirmation,
  renderItems
}: { 
  item: RoomItem; 
  level: number; 
  items: RoomItem[]; 
  expandedGroups: Set<string>; 
  toggleGroup: (id: string) => void; 
  openFile: (item: RoomItem) => void; 
  setHoverPreview: (preview: any) => void; 
  canEdit: boolean; 
  togglePin: (item: RoomItem) => Promise<void>; 
  setIsAddItemModalOpen: (state: any) => void; 
  setDeleteConfirmation: (id: string | null) => void;
  renderItems: (parentId: string | null, level: number) => React.ReactNode;
  key?: string | number;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: !canEdit,
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: item.id,
    disabled: !canEdit || item.type !== 'group',
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const hasChildren = items.some(i => i.parentId === item.id);

  return (
    <div ref={setSortableRef} style={style} className="group/item">
      <div 
        ref={setDroppableRef}
        className={cn(
          "flex items-center gap-2 p-2 rounded-lg transition-all cursor-pointer select-none",
          "hover:bg-zinc-50 border border-transparent",
          item.pinned && "bg-blue-50/30 border-blue-100/50",
          isOver && item.type === 'group' && "bg-blue-100/50 border-blue-300"
        )}
        onClick={() => {
          if (item.type === 'group' || hasChildren) {
            toggleGroup(item.id);
          }
          if (item.type === 'file') {
            openFile(item);
          }
        }}
        onMouseEnter={(e) => {
          if (item.type === 'file') {
            setHoverPreview({
              id: item.id,
              name: item.name,
              content: item.content || '',
              mimeType: item.mimeType,
              x: e.clientX,
              y: e.clientY
            });
          }
        }}
        onMouseLeave={() => setHoverPreview(null)}
        {...attributes}
        {...listeners}
      >
        <div className="flex items-center gap-1.5 shrink-0">
          {hasChildren ? (
            expandedGroups.has(item.id) ? <ChevronDown className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
          ) : (
            <div className="w-3.5 h-3.5" />
          )}
          
          {item.type === 'group' ? (
            <Folder className="w-4 h-4 text-amber-400 fill-amber-400" />
          ) : item.mimeType?.startsWith('image/') ? (
            <ImageIcon className="w-4 h-4 text-purple-500" />
          ) : item.mimeType === 'application/pdf' ? (
            <FileIcon className="w-4 h-4 text-red-500" />
          ) : (
            <FileText className="w-4 h-4 text-blue-500" />
          )}
        </div>
        
        <span className="flex-1 text-sm font-medium text-zinc-700 truncate">
          {item.name}
        </span>

        <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
          {canEdit && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); togglePin(item); }}
                className={cn("p-1 rounded hover:bg-zinc-200", item.pinned ? "text-blue-600" : "text-zinc-400")}
                title="Pin item"
              >
                {item.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsAddItemModalOpen({ type: 'file', parentId: item.id }); }}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-blue-600"
                title="Add file inside"
              >
                <FilePlus className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsAddItemModalOpen({ type: 'group', parentId: item.id }); }}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-amber-600"
                title="Add group inside"
              >
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); setDeleteConfirmation(item.id); }}
                className="p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      
      {(item.type === 'group' || hasChildren) && expandedGroups.has(item.id) && (
        <div className="mt-1">
          {renderItems(item.id, level + 1)}
        </div>
      )}
    </div>
  );
};

import { WindowManager } from './WindowManager';
