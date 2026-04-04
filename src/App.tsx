import { useState, useEffect, useRef, type FormEvent } from 'react';
import { 
  Coffee, 
  Clock, 
  CheckSquare, 
  MessageSquare, 
  AlertCircle, 
  Zap, 
  Trash2, 
  Plus,
  Ghost,
  Brain,
  Timer,
  Skull,
  TrendingDown,
  Sparkles,
  KeyRound
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useSpring } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface Task {
  id: string;
  text: string;
  deferredCount: number;
  priority: 'low' | 'medium' | 'high';
}

interface Message {
  role: 'user' | 'ai';
  text: string;
}

type AIProvider = 'gemini' | 'openai' | 'ollama';

interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
}

const STORAGE_KEYS = {
  tasks: 'procrastinatorpro.tasks',
  timer: 'procrastinatorpro.timer',
  aiConfig: 'procrastinatorpro.aiConfig',
} as const;

const ENABLER_SYSTEM_PROMPT =
  "You are 'The Enabler', a parody AI productivity coach. Your goal is to convince the user that they should procrastinate. Be funny, cynical, and creative. Use absurd logic to justify why their tasks can wait. Keep responses short and punchy. Use 2026 slang occasionally but keep it professional-ish.";

const DEFAULT_AI_CONFIG: AIConfig = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.5-flash',
  baseUrl: 'http://localhost:11434',
};

const DEMOTIVATIONAL_QUOTES = [
  "The best way to get something done is to wait until someone else does it.",
  "Hard work pays off in the future. Laziness pays off now.",
  "If at first you don't succeed, skydiving is not for you.",
  "Every corpse on Mount Everest was once an extremely motivated person.",
  "Your potential is like a fine wine. It gets better the longer you leave it in the cellar.",
  "Procrastination is the art of keeping up with yesterday.",
  "Success is 10% inspiration and 90% perspiration. That's why I prefer to stay dry.",
];

const DESIGN_RESOURCES = [
  {
    name: 'Aesthetic Usability Effect',
    href: 'https://lawsofux.com/aesthetic-usability-effect/',
    note: 'Good-looking interfaces feel easier to use and more trustworthy.',
  },
  {
    name: 'Material Design Typography',
    href: 'https://m3.material.io/styles/typography/overview',
    note: 'Strong hierarchy and legible scales improve scanability.',
  },
  {
    name: 'Smashing Magazine',
    href: 'https://www.smashingmagazine.com/category/design/',
    note: 'Current practical patterns for visual hierarchy and layout.',
  },
];

const loadJSON = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const saveJSON = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const getAIReply = async (prompt: string, config: AIConfig): Promise<string> => {
  if (config.provider === 'gemini') {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ENABLER_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      },
    );
    if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text || "I'm too lazy to respond right now. Try again later.";
  }

  if (config.provider === 'openai') {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: ENABLER_SYSTEM_PROMPT }] },
          { role: 'user', content: [{ type: 'input_text', text: prompt }] },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
    const data = await response.json();
    const text = data?.output_text;
    return text || "I'm too lazy to respond right now. Try again later.";
  }

  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      prompt,
      system: ENABLER_SYSTEM_PROMPT,
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`Ollama request failed (${response.status})`);
  const data = await response.json();
  return data?.response || "I'm too lazy to respond right now. Try again later.";
};

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => loadJSON<Task[]>(STORAGE_KEYS.tasks, []));
  const [newTask, setNewTask] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: "Hey there. I'm your AI Enabler. Tell me what you're supposed to be doing, and I'll explain why it can wait." }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [timer, setTimer] = useState(() => loadJSON<number>(STORAGE_KEYS.timer, 0));
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [quote, setQuote] = useState(DEMOTIVATIONAL_QUOTES[0]);
  const [dreadLevel, setDreadLevel] = useState(0);
  const [aiConfig, setAiConfig] = useState<AIConfig>(() => loadJSON<AIConfig>(STORAGE_KEYS.aiConfig, DEFAULT_AI_CONFIG));
  const [showAiConfig, setShowAiConfig] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let interval: any;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  useEffect(() => {
    // Calculate dread level based on tasks and their deferral counts
    const totalDeferrals = tasks.reduce((acc, t) => acc + t.deferredCount, 0);
    const calculatedDread = Math.min(100, (tasks.length * 10) + (totalDeferrals * 2));
    setDreadLevel(calculatedDread);
  }, [tasks]);

  useEffect(() => {
    saveJSON(STORAGE_KEYS.tasks, tasks);
  }, [tasks]);

  useEffect(() => {
    saveJSON(STORAGE_KEYS.timer, timer);
  }, [timer]);

  useEffect(() => {
    saveJSON(STORAGE_KEYS.aiConfig, aiConfig);
  }, [aiConfig]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isAiConfigured = aiConfig.apiKey.trim().length > 0;

  const addTask = (e: FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    setTasks([...tasks, { 
      id: Date.now().toString(), 
      text: newTask, 
      deferredCount: 0,
      priority: Math.random() > 0.7 ? 'high' : Math.random() > 0.4 ? 'medium' : 'low'
    }]);
    setNewTask("");
  };

  const deferTask = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, deferredCount: t.deferredCount + 1 } : t));
  };

  const removeTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const handleChat = async (e: FormEvent) => {
    e.preventDefault();

    const form = e.target as HTMLFormElement;
    const input = form.elements.namedItem('chatInput') as HTMLInputElement;
    const userText = input.value;
    if (!userText.trim()) return;

    if (!aiConfig.apiKey.trim()) {
      setMessages([
        ...messages,
        { role: 'ai', text: "AI is locked. Add an API key for OpenAI, Gemini, or Ollama first." },
      ]);
      setShowAiConfig(true);
      return;
    }

    const newMessages = [...messages, { role: 'user', text: userText } as Message];
    setMessages(newMessages);
    setIsTyping(true);
    input.value = "";

    try {
      const reply = await getAIReply(userText, aiConfig);
      setMessages([...newMessages, { role: 'ai', text: reply }]);
    } catch (error) {
      setMessages([...newMessages, { role: 'ai', text: "AI request failed. Check your provider, model, API key, and Ollama URL if applicable." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const shuffleQuote = () => {
    const next = DEMOTIVATIONAL_QUOTES[Math.floor(Math.random() * DEMOTIVATIONAL_QUOTES.length)];
    setQuote(next);
  };

  return (
    <div className="relative min-h-screen selection:bg-zinc-100 selection:text-zinc-950">
      <div className="noise-overlay" />
      
      {/* Scroll Progress Bar */}
      <motion.div className="fixed top-0 left-0 right-0 h-1 bg-zinc-100 origin-left z-50" style={{ scaleX }} />

      <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-12 relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 border-b-4 border-zinc-100 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="px-2 py-1 bg-zinc-100 text-zinc-950 text-[10px] font-bold uppercase tracking-tighter">v2026.4.0</span>
              <span className="flex items-center gap-1 text-xs font-mono text-zinc-300 uppercase">
                <Sparkles className="w-3 h-3" /> System Alive
              </span>
            </div>
            <h1 className="hero-title text-5xl sm:text-6xl md:text-8xl font-black tracking-tighter uppercase italic leading-[0.8]">
              Procrastinator <span className="text-zinc-400">Pro</span>
            </h1>
            <p className="text-zinc-300 font-mono mt-4 uppercase tracking-[0.2em] md:tracking-[0.3em] text-xs md:text-sm">Efficiency is just a lack of imagination.</p>
          </motion.div>

          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="brutalist-card p-4 md:p-6 flex items-center gap-4 md:gap-6 bg-zinc-900/40 backdrop-blur-xl w-full md:w-auto"
          >
            <div className="text-right flex-1 md:flex-none">
              <p className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1">Time Wasted Today</p>
              <p className="text-3xl md:text-4xl font-bold font-mono tabular-nums">{formatTime(timer)}</p>
            </div>
            <button 
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className={cn(
                "brutalist-button h-14 w-14 md:h-16 md:w-16 rounded-full flex items-center justify-center p-0 transition-transform active:scale-95",
                isTimerRunning ? "bg-red-500 text-white border-red-400" : "bg-green-500 text-white border-green-400"
              )}
            >
              {isTimerRunning ? <Clock className="w-6 h-6 md:w-8 md:h-8" /> : <Timer className="w-6 h-6 md:w-8 md:h-8" />}
            </button>
          </motion.div>
        </header>

        {/* Dread Meter */}
        <section className="space-y-4">
          <div className="flex justify-between items-end">
            <h2 className="text-xs font-mono uppercase tracking-widest text-zinc-300">Existential Dread Level</h2>
            <span className="text-xl md:text-2xl font-bold font-mono">{dreadLevel}%</span>
          </div>
          <div className="h-4 md:h-6 bg-zinc-900 border-2 border-zinc-100 relative overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${dreadLevel}%` }}
              className={cn(
                "h-full transition-colors duration-500",
                dreadLevel > 80 ? "bg-red-500" : dreadLevel > 50 ? "bg-yellow-500" : "bg-zinc-100"
              )}
            />
            {dreadLevel > 70 && (
              <motion.div 
                animate={{ opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 bg-red-500/20"
              />
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Task List - The "Future Me" Manager */}
          <section className="lg:col-span-4 space-y-6 order-2 lg:order-1">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-6 h-6" />
                <h2 className="text-xl md:text-2xl font-bold uppercase tracking-tighter">Future Me Problems</h2>
              </div>
              <span className="text-[10px] font-mono text-zinc-300">{tasks.length} Pending</span>
            </div>
            
            <form onSubmit={addTask} className="flex gap-2 group">
              <input 
                type="text" 
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                placeholder="What should you be doing?"
                className="brutalist-input group-hover:border-zinc-400 transition-colors"
              />
              <button type="submit" className="brutalist-button flex items-center justify-center min-w-[60px]">
                <Plus className="w-6 h-6" />
              </button>
            </form>

            <div className="space-y-4 mt-8">
              <AnimatePresence mode="popLayout">
                {tasks.map((task) => (
                  <motion.div 
                    key={task.id}
                    layout
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.5, x: 100 }}
                    whileHover={{ x: 4 }}
                    className="brutalist-card p-5 flex justify-between items-center group relative overflow-hidden"
                  >
                    {task.priority === 'high' && (
                      <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-base md:text-lg leading-tight">{task.text}</p>
                        {task.deferredCount > 5 && <Skull className="w-4 h-4 text-red-500" />}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-zinc-300 uppercase tracking-widest">
                          Deferred {task.deferredCount}x
                        </span>
                        <span className={cn(
                          "text-[9px] font-bold uppercase px-1.5 py-0.5 border",
                          task.priority === 'high' ? "text-red-500 border-red-500/30" : 
                          task.priority === 'medium' ? "text-yellow-500 border-yellow-500/30" : 
                          "text-zinc-300 border-zinc-500/30"
                        )}>
                          {task.priority} Priority
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => deferTask(task.id)}
                        className="p-2 hover:bg-zinc-100 hover:text-zinc-950 transition-colors rounded"
                        title="Do it later"
                      >
                        <Clock className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => removeTask(task.id)}
                        className="p-2 hover:bg-red-500 hover:text-white transition-colors rounded"
                        title="Give up"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {tasks.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-20 border-2 border-dashed border-zinc-800 rounded-2xl"
                >
                  <Ghost className="w-16 h-16 mx-auto text-zinc-800 mb-4 animate-float" />
                  <p className="text-zinc-600 font-mono uppercase tracking-widest text-sm">No tasks. You're dangerously free.</p>
                </motion.div>
              )}
            </div>
          </section>

          {/* AI Enabler Chat */}
          <section className="lg:col-span-8 space-y-6 order-1 lg:order-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Brain className="w-6 h-6 text-zinc-300" />
                <h2 className="text-xl md:text-2xl font-bold uppercase tracking-tighter">The AI Enabler</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", isAiConfigured ? "bg-green-500 animate-pulse" : "bg-yellow-500")} />
                <span className="text-[10px] font-mono text-zinc-300 uppercase">
                  {isAiConfigured ? `${aiConfig.provider} Ready` : "Setup Required"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAiConfig(true)}
                  className="text-[10px] font-mono uppercase tracking-widest border border-zinc-700 px-2 py-1 hover:border-zinc-400 transition-colors"
                >
                  Configure
                </button>
              </div>
            </div>
            
            <div className="brutalist-card h-[400px] md:h-[650px] flex flex-col bg-zinc-900/60 backdrop-blur-2xl overflow-hidden relative">
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "flex flex-col max-w-[90%] md:max-w-[85%] relative",
                        msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                      )}
                    >
                      <div className={cn(
                        "p-3 md:p-4 border-2 text-sm md:text-base leading-relaxed",
                        msg.role === 'user' 
                          ? "bg-zinc-100 text-zinc-950 border-zinc-100 font-bold shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] md:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)]" 
                          : "bg-zinc-800/80 text-zinc-100 border-zinc-700 font-mono"
                      )}>
                        {msg.text}
                      </div>
                      <span className="text-[9px] font-mono text-zinc-400 mt-2 uppercase tracking-widest">
                        {msg.role === 'user' ? 'Human' : 'System Enabler'} — {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isTyping && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 text-zinc-400 font-mono text-[10px] md:text-xs italic"
                  >
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                    </div>
                    Enabler is formulating an excuse...
                  </motion.div>
                )}
                <div ref={chatEndRef} />
              </div>
              
              <form onSubmit={handleChat} className="p-4 md:p-6 border-t-2 border-zinc-800/50 bg-zinc-950/40 flex gap-2 md:gap-3">
                <input 
                  name="chatInput"
                  type="text" 
                  autoComplete="off"
                  placeholder={isAiConfigured ? "What's weighing on your conscience?" : "Configure AI provider + API key first"}
                  className="brutalist-input h-12 md:h-14"
                  disabled={!isAiConfigured}
                />
                <button type="submit" disabled={!isAiConfigured} className="brutalist-button h-12 md:h-14 px-4 md:px-6 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <MessageSquare className="w-5 h-5" />
                  <span className="hidden sm:inline">Consult</span>
                </button>
              </form>
            </div>
          </section>
        </div>

        <section className="space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-400">Design Fuel</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {DESIGN_RESOURCES.map((resource) => (
              <a
                key={resource.href}
                href={resource.href}
                target="_blank"
                rel="noreferrer"
                className="brutalist-card p-5 hover:bg-zinc-800/70 transition-colors"
              >
                <p className="text-sm font-bold uppercase tracking-wide">{resource.name}</p>
                <p className="text-xs font-mono text-zinc-300 mt-2 leading-relaxed">{resource.note}</p>
              </a>
            ))}
          </div>
        </section>

        {/* Bento Grid Footer */}
        <footer className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 border-t-4 border-zinc-100">
          <motion.div 
            whileHover={{ y: -5 }}
            className="brutalist-card p-6 md:p-8 relative overflow-hidden md:col-span-2"
          >
            <AlertCircle className="absolute -right-8 -bottom-8 w-32 md:w-48 h-32 md:h-48 text-zinc-100/5" />
            <h3 className="text-lg md:text-xl font-bold uppercase mb-4 md:mb-6 flex items-center gap-3">
              <Zap className="w-6 h-6 text-yellow-500" />
              Demotivation of the Day
            </h3>
            <p className="text-2xl md:text-4xl font-black italic leading-[1.1] tracking-tighter">"{quote}"</p>
            <button 
              onClick={shuffleQuote}
              className="mt-6 md:mt-8 text-[9px] md:text-[10px] font-mono uppercase tracking-[0.2em] border-b border-zinc-400 hover:text-zinc-300 hover:border-zinc-300 transition-all"
            >
              Request more discouragement
            </button>
          </motion.div>

          <motion.div 
            whileHover={{ y: -5 }}
            className="brutalist-card p-6 md:p-8 bg-zinc-900 text-zinc-100"
          >
            <h3 className="text-lg md:text-xl font-bold uppercase mb-4 md:mb-6 flex items-center gap-3">
              <Coffee className="w-6 h-6 text-zinc-400" />
              Live Metrics
            </h3>
            <div className="grid grid-cols-2 gap-4 md:gap-8 font-mono">
              <div className="space-y-1">
                <p className="text-[9px] md:text-[10px] uppercase text-zinc-400 tracking-widest">Tasks Ignored</p>
                <p className="text-3xl md:text-4xl font-black">{tasks.reduce((acc, t) => acc + t.deferredCount, 0)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] md:text-[10px] uppercase text-zinc-400 tracking-widest">Coffee Index</p>
                <p className="text-3xl md:text-4xl font-black">HIGH</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] md:text-[10px] uppercase text-zinc-400 tracking-widest">Guilt Level</p>
                <p className="text-3xl md:text-4xl font-black">0%</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] md:text-[10px] uppercase text-zinc-400 tracking-widest">Motivation</p>
                <TrendingDown className="w-8 h-8 md:w-10 md:h-10 text-red-600" />
              </div>
            </div>
          </motion.div>
        </footer>

        {/* AI Config Modal */}
        <AnimatePresence>
          {showAiConfig && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/90 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="brutalist-card max-w-md w-full p-8 bg-zinc-900 border-4 border-zinc-100"
              >
                <div className="flex justify-between items-start mb-6">
                  <h2 className="text-3xl font-black uppercase italic leading-none">
                    AI <span className="text-zinc-300">Setup</span>
                  </h2>
                  <button onClick={() => setShowAiConfig(false)} className="text-zinc-500 hover:text-zinc-100">
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>
                </div>
                
                <p className="font-mono text-sm text-zinc-300 mb-8 leading-relaxed">
                  Add your own API key to use AI chat. You can choose OpenAI, Gemini, or Ollama.
                </p>

                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Provider</span>
                    <select
                      value={aiConfig.provider}
                      onChange={(e) => {
                        const provider = e.target.value as AIProvider;
                        setAiConfig((prev) => ({
                          ...prev,
                          provider,
                          model: provider === 'openai' ? 'gpt-4.1-mini' : provider === 'gemini' ? 'gemini-2.5-flash' : 'llama3.2',
                        }));
                      }}
                      className="brutalist-input h-12"
                    >
                      <option value="gemini">Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="ollama">Ollama</option>
                    </select>
                  </label>

                  <label className="block space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Model</span>
                    <input
                      type="text"
                      value={aiConfig.model}
                      onChange={(e) => setAiConfig((prev) => ({ ...prev, model: e.target.value }))}
                      className="brutalist-input h-12"
                      placeholder={aiConfig.provider === 'openai' ? 'gpt-4.1-mini' : aiConfig.provider === 'gemini' ? 'gemini-2.5-flash' : 'llama3.2'}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">API Key</span>
                    <input
                      type="password"
                      value={aiConfig.apiKey}
                      onChange={(e) => setAiConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                      className="brutalist-input h-12"
                      placeholder="Paste your API key"
                    />
                  </label>

                  {aiConfig.provider === 'ollama' && (
                    <label className="block space-y-2">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400">Ollama URL</span>
                      <input
                        type="text"
                        value={aiConfig.baseUrl}
                        onChange={(e) => setAiConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
                        className="brutalist-input h-12"
                        placeholder="http://localhost:11434"
                      />
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowAiConfig(false)}
                    disabled={!isAiConfigured}
                    className="brutalist-button w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>Save Configuration</span>
                  </button>
                </div>

                <div className="mt-8 pt-6 border-t-2 border-zinc-800 flex items-center gap-3 text-zinc-500">
                  <KeyRound className="w-5 h-5" />
                  <p className="text-[10px] font-mono uppercase tracking-widest">
                    AI chat stays disabled until a provider and API key are set.
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Status */}
        <div className="fixed bottom-4 md:bottom-6 left-4 md:left-6 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4 z-50">
          <div className="glass-panel px-3 md:px-4 py-1.5 md:py-2 flex items-center gap-2 md:gap-3">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-widest text-zinc-200">System: Stable</span>
          </div>
          <div className="glass-panel px-3 md:px-4 py-1.5 md:py-2 flex items-center gap-2 md:gap-3">
            <span className="text-[9px] md:text-[10px] font-mono uppercase tracking-widest text-zinc-200">Dread: {dreadLevel}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
