import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, X, Send, Loader, WifiOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { aiAPI } from '../services/api';

const AIChatbot = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi ${user?.first_name || 'there'}! I'm your I-Dash AI assistant. I can help you analyze dashboard metrics, explain trends, or answer questions about your data. What would you like to know?`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const question = input.trim();
    const userMsg = { role: 'user', content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const { data } = await aiAPI.chat(question);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer || 'Sorry, I could not generate a response.',
          live: true,
        },
      ]);
    } catch (err) {
      const status = err?.response?.status;
      let fallback;

      if (status === 503) {
        fallback =
          'The AI service is not configured yet. Ask your admin to set the GROQ_API_KEY in Railway Variables to enable live AI insights.';
      } else if (status === 401 || status === 403) {
        fallback =
          'You need to be logged in to use AI chat. Please sign in and try again.';
      } else {
        fallback =
          "I'm having trouble reaching the analytics backend right now. Data may still be syncing — please try again in a moment.";
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fallback, error: true },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-[#55A8C3] to-[#265AA9] text-white shadow-lg shadow-[#265AA9]/30 flex items-center justify-center"
          >
            <Bot size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`fixed bottom-6 right-6 z-50 w-96 h-[520px] rounded-2xl shadow-2xl flex flex-col overflow-hidden ${
              isDark
                ? 'bg-[#1a1d2e] border border-slate-700/50'
                : 'bg-white border border-slate-200'
            }`}
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#265AA9] to-[#55A8C3]">
              <div className="flex items-center gap-2">
                <Bot size={20} className="text-white" />
                <div>
                  <span className="text-white font-semibold text-sm block">I-Dash AI</span>
                  <span className="text-white/70 text-[10px]">Powered by Groq</span>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${
              isDark ? 'bg-[#0f1117]' : 'bg-slate-50'
            }`}>
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#265AA9] text-white rounded-br-md'
                        : msg.error
                          ? isDark
                            ? 'bg-amber-900/30 text-amber-200 border border-amber-700/30 rounded-bl-md'
                            : 'bg-amber-50 text-amber-800 border border-amber-200 rounded-bl-md'
                          : isDark
                            ? 'bg-[#1e2235] text-slate-200 border border-slate-700/30 rounded-bl-md'
                            : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md shadow-sm'
                    }`}
                  >
                    {msg.error && (
                      <WifiOff size={12} className="inline mr-1.5 opacity-60" />
                    )}
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li>{children}</li>,
                          h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                          code: ({ children }) => (
                            <code className="px-1 py-0.5 rounded bg-black/10 text-xs font-mono">{children}</code>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className={`rounded-2xl px-4 py-2.5 rounded-bl-md ${
                    isDark ? 'bg-[#1e2235] border border-slate-700/30' : 'bg-white border border-slate-200'
                  }`}>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-[#55A8C3] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-[#55A8C3] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-[#55A8C3] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className={`p-3 border-t ${isDark ? 'border-slate-700/30 bg-[#1a1d2e]' : 'border-slate-200 bg-white'}`}>
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your data..."
                  className={`flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-all ${
                    isDark
                      ? 'bg-[#0f1117] text-white border border-slate-700/50 focus:border-[#55A8C3]/50 placeholder-slate-500'
                      : 'bg-slate-100 text-slate-900 border border-slate-200 focus:border-[#265AA9]/50 placeholder-slate-400'
                  }`}
                  disabled={isTyping}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="w-10 h-10 rounded-xl bg-[#265AA9] text-white flex items-center justify-center hover:bg-[#1d4a8f] transition-colors disabled:opacity-40"
                >
                  {isTyping ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIChatbot;
