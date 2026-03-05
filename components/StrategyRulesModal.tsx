'use client';

import { useEffect } from 'react';

interface StrategyRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function StrategyRulesModal({ isOpen, onClose, title, children }: StrategyRulesModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#fff', border: '1px solid #b4b4b4',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
          width: '90%', maxWidth: 500, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* 타이틀 바 */}
        <div style={{
          backgroundColor: '#217346', color: '#fff', padding: '8px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontWeight: 700, fontSize: 12, flexShrink: 0,
        }}>
          <span>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#fff',
              fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
        {/* 본문 */}
        <div style={{ padding: '12px 16px', overflowY: 'auto', fontSize: 11, lineHeight: 1.7 }}>
          {children}
        </div>
      </div>
    </div>
  );
}