import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';

const AIChatPanel = ({ isOpen, onClose }) => {
  const { isDark } = useTheme();
  const [messages, setMessages] = useState([
    {
      id: '1',
      type: 'ai',
      text: 'Hey! I\'m your AI analyst. I can help you understand your data, find trends, and answer questions about your campaigns. What would you like to know?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const quickQuestions = [
    "What's driving revenue?",
    'Compare Meta vs Google',
    'Show anomalies',
    'Executive summary',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text = null) => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    // Add user message
    const userMessage = {
      id: Date.now().toString(),
      type: 'user',
      text: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    // Simulate API delay
    setTimeout(() => {
      const fallbackResponses = {
        "What's driving revenue?":
          'Based on your data, **Meta Ads** are your top performer with a 2.21 ROAS. Your Q1 campaign is generating 45,230 clicks with a CTR of 3.63%. Consider increasing budget allocation to this channel.',
        'Compare Meta vs Google':
          'Meta Ads: ROAS 2.21, CPC $1.45, CTR 3.63%\n\nGoogle Ads: ROAS 2.35, CPC $2.10, CTR 4.32%\n\nGoogle has slightly better ROAS but higher cost per click. Meta offers better volume.',
        'Show anomalies':
          'I found 2 anomalies:\n\n1. **Tuesday spike**: Revenue jumped 23% - correlated with email campaign launch\n\n2. **Cost increase**: CPL increased 12% on Wednesday - investigate bid adjustments',
        'Executive summary':
          '**Weekly Summary**\n\n- Total Revenue: $124.5K (+11%)\n- Average ROAS: 2.45x\n- Cost Per Lead: $15.20 (-10.6%)\n- Top Channel: Meta (45K clicks)\n- Recommendation: Scale Meta budget by 25%',
      };

      const aiMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        text: fallbackResponses[messageText] || 'I\'m still learning! Please try a different question.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
      setLoading(false);
    }, 1000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          />

          {/* Panel - Slide in from right */}
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`fixed right-0 top-0 bottom-0 w-96 flex flex-col z-50 shadow-2xl border-l ${
              isDark
                ? 'bg-[#1a1d2e] border-slate-700/50'
                : 'bg-white border-slate-200'
            }`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${
              isDark ? 'border-slate-700/30' : 'border-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-lg">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    AI Assistant
                  </h3>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClose}
                className={`p-1 rounded-lg transition-colors ${
                  isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100'
                }`}
              >
                <X className={`w-5 h-5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`} />
              </motion.button>
            </div>

            {/* Messages */}
            <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${
              isDark ? 'bg-[#1a1d2e]' : 'bg-white'
            }`}>
              <AnimatePresence mode="wait">
                {messages.map((msg, idx) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs px-4 py-3 rounded-lg ${
                        msg.type === 'user'
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-br-none'
                          : isDark
                            ? 'bg-slate-800/50 text-slate-300 border border-slate-700/30 rounded-bl-none'
                            : 'bg-slate-100 text-slate-900 border border-slate-200 rounded-bl-none'
                      }`}
                    >
                      {msg.type === 'ai' ? (
                        <ReactMarkdown className="prose prose-sm max-w-none text-inherit [&_strong]:font-bold [&_strong]:text-inherit">
                          {msg.text}
                        </ReactMarkdown>
                      ) : (
                        <p className="text-sm">{msg.text}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-1"
                >
                  <div className={`w-2 h-2 rounded-full animate-bounce ${isDark ? 'bg-slate-500' : 'bg-slate-400'}`}></div>
                  <div className={`w-2 h-2 rounded-full animate-bounce ${isDark ? 'bg-slate-500' : 'bg-slate-400'}`} style={{ animationDelay: '0.2s' }}></div>
                  <div className={`w-2 h-2 rounded-full animate-bounce ${isDark ? 'bg-slate-500' : 'bg-slate-400'}`} style={{ animationDelay: '0.4s' }}></div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Questions */}
            {messages.length <= 1 && !input && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`px-4 py-3 border-t ${isDark ? 'border-slate-700/30 bg-[#1a1d2e]' : 'border-slate-200 bg-slate-50'}`}
              >
                <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Quick questions:
                </p>
                <div className="space-y-2">
                  {quickQuestions.map((q, idx) => (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.02, x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSendMessage(q)}
                      disabled={loading}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        isDark
                          ? 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {q}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Input */}
            <div className={`p-4 border-t ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask me anything..."
                  disabled={loading}
                  className={`flex-1 px-4 py-2 rounded-lg border transition-all text-sm ${
                    isDark
                      ? 'bg-slate-800/50 border-slate-700/50 text-white placeholder-slate-500 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30'
                  }`}
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleSendMessage()}
                  disabled={!input.trim() || loading}
                  className="p-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-indigo-600 hover:to-purple-600 transition-all"
                >
                  <Send className="w-4 h-4" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AIChatPanel;
