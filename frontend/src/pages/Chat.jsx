import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import api from '../services/api';

export default function Chat() {
  const [messages, setMessages] = useState([
    { id: 1, role: 'assistant', content: 'Hello! I am your AI assistant, powered by the documents in your knowledge base. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [kbId, setKbId] = useState(null);
  const [kbError, setKbError] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch the default knowledge base ID on mount
  useEffect(() => {
    const fetchKbId = async () => {
      try {
        const res = await api.get('/knowledge/list');
        const kbs = res.data.knowledge_bases || [];
        if (kbs.length > 0) {
          setKbId(kbs[0].id);
        } else {
          setKbError('No Knowledge Base found. Please upload a document first.');
        }
      } catch (error) {
        console.error("Failed to fetch knowledge bases", error);
        setKbError('Failed to load Knowledge Base. Ensure you are logged in.');
      }
    };
    fetchKbId();
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !kbId) return;

    // Add user message
    const userMessage = { id: Date.now(), role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/agent/ask', { 
        knowledge_base_id: kbId, 
        query: currentInput 
      });
      
      const assistantMessage = { 
        id: Date.now() + 1, 
        role: 'assistant', 
        content: res.data.data.answer,
        context: res.data.data.context_used
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Failed to fetch answer", error);
      const errorMessage = { 
        id: Date.now() + 1, 
        role: 'assistant', 
        content: error.response?.data?.error || "I'm sorry, I encountered an error while processing your request." 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-2">
          <Sparkles className="text-indigo-400" /> AI Assistant
        </h1>
        <p className="text-slate-400">Ask questions and get answers based on your uploaded documents and website data.</p>
      </div>

      {kbError && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl mb-4 flex items-center gap-3 text-sm">
          <AlertTriangle size={18} />
          {kbError}
        </div>
      )}

      <div className="flex-1 bg-[#111827] border border-slate-800 rounded-t-2xl flex flex-col overflow-hidden relative shadow-2xl">
        {/* Chat Header */}
        <div className="p-4 border-b border-slate-800 bg-[#0b1120] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
              <Bot className="text-indigo-400" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-white">RAG Agent</h3>
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block"></span>
                Online & Ready
              </p>
            </div>
          </div>
          <div className="text-xs font-semibold text-slate-500 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
            Powered by your RAG knowledge base
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gradient-to-b from-[#111827] to-[#0f172a]">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
                msg.role === 'user' ? 'bg-slate-700' : 'bg-indigo-600'
              }`}>
                {msg.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl p-4 ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-sm' 
                  : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm'
              }`}>
                <p className="leading-relaxed text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.role === 'assistant' && msg.context && msg.context.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-col gap-1">
                    <span className="text-xs text-slate-400 font-semibold">Sources:</span>
                    <ul className="list-disc list-inside text-xs text-slate-500">
                      {msg.context.slice(0, 3).map((ctx, idx) => (
                        <li key={idx} className="truncate">{ctx.filename || 'Unknown Document'}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-4 flex-row">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 bg-indigo-600">
                <Loader2 size={16} className="text-white animate-spin" />
              </div>
              <div className="max-w-[80%] rounded-2xl p-4 bg-slate-800 border border-slate-700 text-slate-200 rounded-tl-sm flex items-center">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="bg-[#0b1120] border border-t-0 border-slate-800 rounded-b-2xl p-4">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={kbId ? "Ask a question about your documents..." : "Please upload a document to your Knowledge Base first"}
            disabled={!kbId || loading}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl py-4 pl-4 pr-16 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner disabled:opacity-50"
          />
          <button 
            type="submit"
            disabled={!input.trim() || !kbId || loading}
            className="absolute right-2 top-2 bottom-2 aspect-square bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg flex items-center justify-center transition-colors"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} className={input.trim() ? "ml-1" : ""} />}
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-3">
          AI agents can make mistakes. Consider verifying important information from the source documents.
        </p>
      </div>
    </div>
  );
}
