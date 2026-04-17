import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { registerChatLauncher } from '../chat/chatLauncherBridge';
import { chatWithAssistant } from '../api/mlApi';

function normalizeMessageText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/([.!?])(?=\p{L})/gu, '$1 ')
    .trim();
}

export default function ChatWindow({ isFallbackActive }) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { id: 'welcome', text: t('chat.welcome'), sender: 'ai' },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    // Register this window to be opened by the ChatLauncherButton
    registerChatLauncher(() => setIsOpen(true));
  }, []);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.id === 'welcome') {
        return [{ id: 'welcome', text: t('chat.welcome'), sender: 'ai' }];
      }
      return prev;
    });
  }, [i18n.language, t]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    const userMsg = { id: Date.now(), text: normalizeMessageText(inputValue), sender: 'user' };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    if (isFallbackActive) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: t('chat.emergencyHelp'), sender: 'ai' },
      ]);
      setInputValue('');
      setIsTyping(false);
      return;
    }

    try {
      // Pass the current i18n language to the backend
      const response = await chatWithAssistant(userMsg.text, i18n.resolvedLanguage || i18n.language);
      const assistantReply = normalizeMessageText(response?.reply || t('chat.errorOffline'));
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: assistantReply, sender: 'ai' },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, text: t('chat.errorOffline'), sender: 'ai' },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="chat-window-overlay" onClick={() => setIsOpen(false)} role="presentation">
      <section className="chat-window" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('chat.title')}>
        <header className="chat-header">
          <div className="chat-header-info">
            <div className="chat-avatar">
              <i className="fa-solid fa-shield-heart"></i>
            </div>
            <div>
              <h3>{t('chat.title')}</h3>
              <p className="chat-subtitle">{t('chat.subtitle')}</p>
            </div>
          </div>
          <button className="chat-close" aria-label={t('chat.close')} onClick={() => setIsOpen(false)}>×</button>
        </header>

        <div className="chat-messages" ref={scrollRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`chat-bubble-wrap ${msg.sender === 'ai' ? 'chat-ai' : 'chat-user'}`}>
              <div className="chat-bubble">
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="chat-bubble-wrap chat-ai">
              <div className="chat-bubble chat-typing">
                <span>.</span><span>.</span><span>.</span>
              </div>
            </div>
          )}
        </div>

        <div className="chat-input-area">
          <input
            type="text"
            placeholder={t('chat.placeholder')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button className="chat-send-btn" onClick={handleSend} disabled={!inputValue.trim()}>
            {t('chat.send')}
          </button>
        </div>
      </section>
    </div>
  );
}
