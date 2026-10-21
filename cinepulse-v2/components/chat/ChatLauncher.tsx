'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, MessageSquare } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { useChat } from '../hooks/useChat';

export function ChatLauncher() {
  const chat = useChat();
  const { isOpen, setIsOpen, setTitleContext, sendMessage } = chat;
  const [pulsing, setPulsing] = useState(true);

  // Turn off initial pulse glow after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => setPulsing(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Global listener for custom events (e.g. from TitleDetail or Command Palette)
  useEffect(() => {
    const handleOpenChat = (e: CustomEvent<{ titleId?: string; prompt?: string }>) => {
      setIsOpen(true);
      if (e.detail?.titleId) {
        setTitleContext(e.detail.titleId);
      }
      if (e.detail?.prompt) {
        sendMessage(e.detail.prompt, e.detail.titleId);
      }
    };

    window.addEventListener('cinepulse:open-chat' as any, handleOpenChat);
    return () => window.removeEventListener('cinepulse:open-chat' as any, handleOpenChat);
  }, [setIsOpen, setTitleContext, sendMessage]);

  // Keyboard shortcut '/' to open chat (when not typing in an input/textarea)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !isOpen) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
          return;
        }
        e.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  return (
    <>
      <button
        className={`chat-launcher ${pulsing ? 'chat-launcher--pulse' : ''}`}
        onClick={() => setIsOpen(true)}
        aria-label="Ask CinePulse AI Assistant"
        title="Ask CinePulse (Press /)"
      >
        <span className="chat-launcher__icon-wrap">
          <Sparkles size={18} className="chat-launcher__sparkle" />
          <MessageSquare size={18} className="chat-launcher__main-icon" />
        </span>
        <span className="chat-launcher__label">Ask CinePulse</span>
      </button>

      {isOpen && (
        <ChatPanel chat={chat} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
