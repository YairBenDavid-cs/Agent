import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { KebabIcon } from '@/shared/ui/icons/KebabIcon';
import type { AssistantConversation } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import styles from './ConversationRow.module.css';

interface ConversationRowProps {
  conversation: AssistantConversation;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRequestDelete: (id: string) => void;
}

const MAX_TITLE = 60;

export function ConversationRow({
  conversation,
  active,
  onSelect,
  onRename,
  onRequestDelete,
}: ConversationRowProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const committed = useRef(false);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function startRename(): void {
    setDraft(conversation.title);
    committed.current = false;
    setEditing(true);
    setMenuOpen(false);
  }

  // Guarded so an Enter keypress (which also blurs the input) commits only once.
  function commit(): void {
    if (committed.current) {
      return;
    }
    committed.current = true;
    setEditing(false);
    const next = draft.trim();
    if (next && next !== conversation.title) {
      onRename(conversation.id, next);
    }
  }

  function cancel(): void {
    committed.current = true;
    setEditing(false);
    setDraft(conversation.title);
  }

  if (editing) {
    return (
      <div className={styles.row}>
        <input
          ref={inputRef}
          className={styles.input}
          value={draft}
          maxLength={MAX_TITLE}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commit();
            } else if (event.key === 'Escape') {
              cancel();
            }
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={active ? `${styles.row} ${styles.active}` : styles.row}
    >
      <button
        type="button"
        className={styles.title}
        onClick={() => onSelect(conversation.id)}
      >
        {conversation.attention && (
          <span className={styles.attentionDot} aria-label="Needs your attention" />
        )}
        {conversation.title}
      </button>
      <button
        type="button"
        className={menuOpen ? `${styles.kebab} ${styles.kebabOpen}` : styles.kebab}
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-label="Conversation options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <KebabIcon />
      </button>
      {menuOpen && (
        <div className={styles.menu} role="menu">
          <button type="button" className={styles.menuItem} role="menuitem" onClick={startRename}>
            Rename
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.delete}`}
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              onRequestDelete(conversation.id);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
