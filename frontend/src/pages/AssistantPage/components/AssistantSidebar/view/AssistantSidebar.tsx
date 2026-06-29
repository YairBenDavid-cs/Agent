import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { NewChatIcon } from '@/shared/ui/icons/NewChatIcon';
import { SidebarToggleIcon } from '@/shared/ui/icons/SidebarToggleIcon';
import { BasketballIcon } from '@/shared/ui/icons/BasketballIcon';
import { SettingsMenu } from '@/shared/ui/SettingsMenu/SettingsMenu';
import type { AssistantConversation } from '@/pages/AssistantPage/domain/assistant/types/assistant';
import { ConversationRow } from '../components/ConversationRow/ConversationRow';
import styles from './AssistantSidebar.module.css';

interface AssistantSidebarProps {
  conversations: AssistantConversation[];
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  activeId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function AssistantSidebar({
  conversations,
  status,
  error,
  activeId,
  collapsed,
  onToggle,
  onNew,
  onSelect,
  onRename,
  onDelete,
}: AssistantSidebarProps): ReactElement {
  return (
    <div className={collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}>
      <div className={styles.brand}>
        <BasketballIcon className={styles.logo} />
        {!collapsed && <span className={styles.brandName}>Popvich</span>}
      </div>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onToggle}
          aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
          data-tooltip={collapsed ? 'Open sidebar' : 'Close sidebar'}
        >
          <SidebarToggleIcon />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onNew}
          aria-label="New Conversation"
          data-tooltip="New Conversation"
        >
          <NewChatIcon />
        </button>
      </header>

      {!collapsed && (
        <div className={styles.list}>
          {status === 'loading' && (
            <div className={styles.center}>
              <Spinner />
            </div>
          )}
          {status === 'error' && (
            <div className={styles.center}>{error ?? 'Failed to load conversations.'}</div>
          )}
          {status === 'ready' && conversations.length === 0 && (
            <p className={styles.empty}>No conversations yet.</p>
          )}
          {status === 'ready' &&
            conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === activeId}
                onSelect={onSelect}
                onRename={onRename}
                onRequestDelete={onDelete}
              />
            ))}
        </div>
      )}

      <footer className={collapsed ? `${styles.footer} ${styles.collapsedFooter}` : styles.footer}>
        {!collapsed && (
          <Link to="/program" className={styles.messengerLink}>
            Program
          </Link>
        )}
        <SettingsMenu />
      </footer>
    </div>
  );
}
