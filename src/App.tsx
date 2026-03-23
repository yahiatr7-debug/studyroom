import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Folder, 
  ChevronRight, 
  LogOut, 
  LayoutGrid, 
  List, 
  Clock, 
  Star,
  BookOpen,
  Users,
  ArrowRight,
  Settings,
  Bell
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  doc, 
  serverTimestamp, 
  orderBy, 
  where,
  getDoc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, signIn, logOut, handleFirestoreError, OperationType } from './firebase';
import { Room as RoomType, Role } from './types';
import { Room } from './components/Room';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomType[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'owned' | 'shared'>('all');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setRooms([]);
      return;
    }

    // Query rooms where user is a member
    const q = query(
      collection(db, 'rooms'),
      where(`members.${user.uid}`, 'in', ['owner', 'editor', 'viewer']),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RoomType));
      setRooms(newRooms);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rooms');
    });

    return () => unsubscribe();
  }, [user]);

  // Handle room ID from URL
  useEffect(() => {
    const handleUrl = async () => {
      const path = window.location.pathname;
      const match = path.match(/\/room\/([a-zA-Z0-9_-]+)/);
      if (match && match[1] && user) {
        const roomId = match[1];
        try {
          const roomRef = doc(db, 'rooms', roomId);
          const roomSnap = await getDoc(roomRef);
          if (roomSnap.exists()) {
            const data = roomSnap.data() as RoomType;
            if (!data.members[user.uid]) {
              await updateDoc(roomRef, {
                [`members.${user.uid}`]: 'viewer' as Role
              });
            }
            setActiveRoomId(roomId);
          }
        } catch (err) {
          console.error("Error joining room from URL:", err);
        }
      }
    };
    handleUrl();
  }, [user]);

  const createRoom = async () => {
    if (!user || !newRoomName.trim()) return;

    try {
      const roomData = {
        name: newRoomName,
        ownerId: user.uid,
        members: {
          [user.uid]: 'owner' as Role
        },
        createdAt: serverTimestamp(),
      };
      const docRef = await addDoc(collection(db, 'rooms'), roomData);
      setNewRoomName('');
      setIsCreateModalOpen(false);
      setActiveRoomId(docRef.id);
      window.history.pushState({}, '', `/room/${docRef.id}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'rooms');
    }
  };

  const joinRoom = async (roomId: string) => {
    if (!user) return;
    try {
      const roomRef = doc(db, 'rooms', roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const data = roomSnap.data() as RoomType;
        if (!data.members[user.uid]) {
          await updateDoc(roomRef, {
            [`members.${user.uid}`]: 'viewer' as Role
          });
        }
        setActiveRoomId(roomId);
        window.history.pushState({}, '', `/room/${roomId}`);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-zinc-50 flex items-center justify-center">
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/20"
        >
          <BookOpen className="w-8 h-8" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen bg-zinc-50 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-10 text-center border border-zinc-100">
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white mx-auto mb-8 shadow-xl shadow-blue-500/20">
            <BookOpen className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-black text-zinc-900 mb-3 tracking-tight">StudyRoom</h1>
          <p className="text-zinc-500 mb-10 leading-relaxed">
            A modern collaborative space for students to organize, share, and study together in real-time.
          </p>
          <button 
            onClick={() => signIn()}
            className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold text-lg hover:bg-zinc-800 transition-all flex items-center justify-center gap-3 shadow-lg hover:shadow-xl active:scale-95"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Continue with Google
          </button>
          <p className="mt-8 text-xs text-zinc-400 font-medium uppercase tracking-widest">
            Secure • Real-time • Collaborative
          </p>
        </div>
      </div>
    );
  }

  const activeRoom = rooms.find(r => r.id === activeRoomId);

  if (activeRoomId && activeRoom) {
    return (
      <Room 
        room={activeRoom} 
        userRole={activeRoom.members[user.uid] || 'viewer'} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans">
      {/* Navbar */}
      <nav className="h-20 bg-white border-b border-zinc-200 px-8 flex items-center justify-between shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <BookOpen className="w-6 h-6" />
          </div>
          <span className="text-xl font-black text-zinc-900 tracking-tight">StudyRoom</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-2 bg-zinc-100 px-3 py-1.5 rounded-xl border border-zinc-200 w-80 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
            <Search className="w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search rooms..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full font-medium text-zinc-700 placeholder:text-zinc-400"
            />
          </div>

          <div className="hidden md:flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200">
            <button 
              onClick={() => setFilter('all')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                filter === 'all' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              All
            </button>
            <button 
              onClick={() => setFilter('owned')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                filter === 'owned' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              Owned
            </button>
            <button 
              onClick={() => setFilter('shared')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                filter === 'shared' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              Shared
            </button>
          </div>
          
          <div className="flex items-center gap-3 border-l border-zinc-200 pl-6">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-zinc-900">{user.displayName}</span>
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Student</span>
            </div>
            <img src={user.photoURL || ''} className="w-10 h-10 rounded-xl border border-zinc-200" alt={user.displayName || ''} />
            <button 
              onClick={() => logOut()}
              className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto p-8">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-3xl font-black text-zinc-900 tracking-tight mb-2">Your Workspace</h2>
            <p className="text-zinc-500 font-medium">Manage your study rooms and collaborative projects</p>
          </div>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center gap-2 shadow-xl shadow-blue-500/20 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            New Room
          </button>
        </div>

        {/* Room Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {rooms
              .filter(room => {
                const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase());
                const isOwner = room.ownerId === user.uid;
                if (filter === 'owned') return matchesSearch && isOwner;
                if (filter === 'shared') return matchesSearch && !isOwner;
                return matchesSearch;
              })
              .map((room) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4 }}
                className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
                onClick={() => {
                  setActiveRoomId(room.id);
                  window.history.pushState({}, '', `/room/${room.id}`);
                }}
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="w-14 h-14 bg-zinc-50 rounded-2xl flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                    <Folder className="w-7 h-7 text-zinc-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <div className="flex -space-x-2">
                    {Object.keys(room.members).slice(0, 3).map((uid, i) => (
                      <div key={uid} className="w-8 h-8 rounded-full border-2 border-white bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500">
                        {i === 2 ? `+${Object.keys(room.members).length - 2}` : 'U'}
                      </div>
                    ))}
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-zinc-900 mb-2 group-hover:text-blue-600 transition-colors">{room.name}</h3>
                <div className="flex items-center gap-4 text-zinc-400 text-sm font-medium mb-6">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    {Object.keys(room.members).length} members
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4" />
                    {new Date(room.createdAt?.seconds * 1000).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-50">
                  <span className={cn(
                    "text-[10px] uppercase tracking-widest font-black px-2.5 py-1 rounded-full",
                    room.ownerId === user.uid ? "bg-blue-50 text-blue-600" : "bg-zinc-100 text-zinc-500"
                  )}>
                    {room.ownerId === user.uid ? 'Owner' : 'Member'}
                  </span>
                  <ArrowRight className="w-5 h-5 text-zinc-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {rooms.length === 0 && (
            <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center text-zinc-400 gap-4">
              <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center">
                <Plus className="w-10 h-10 opacity-20" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-zinc-900">No rooms yet</p>
                <p className="text-sm">Create your first study room to get started</p>
              </div>
              <button 
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-2 px-6 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-colors"
              >
                Create Room
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Create Room Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div key="create-room-overlay" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              key="create-room-modal"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
            <div className="p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                  <Plus className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-zinc-900 tracking-tight">New Room</h3>
                  <p className="text-sm text-zinc-500 font-medium">Create a new collaborative workspace</p>
                </div>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Room Name</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="w-full px-5 py-3.5 bg-zinc-50 border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-lg font-medium"
                    placeholder="e.g. Advanced Physics Study Group"
                    onKeyDown={(e) => e.key === 'Enter' && createRoom()}
                  />
                </div>
              </div>
            </div>
            <div className="p-6 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-3">
              <button 
                onClick={() => setIsCreateModalOpen(false)}
                className="px-6 py-3 text-sm font-bold text-zinc-500 hover:text-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={createRoom}
                className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-sm font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95"
              >
                Create Room
              </button>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
}
