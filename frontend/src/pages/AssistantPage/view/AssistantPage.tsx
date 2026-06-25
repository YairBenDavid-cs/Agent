import { useCallback, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createAssistantConversation } from '../domain/assistant/api/assistantApi';
import { useAssistantConversations } from '../domain/assistant/hooks/useAssistantConversations';
import type { PendingPrompt } from '../domain/assistant/types/assistant';
import { AssistantSidebar } from '../components/AssistantSidebar/view/AssistantSidebar';
import { StartView } from '../components/StartView/view/StartView';
import { ConversationView } from '../components/ConversationView/view/ConversationView';
import styles from './AssistantPage.module.css';

export function AssistantPage(): ReactElement {
  const { id } = useParams();
  const navigate = useNavigate();
  const { conversations, status, error, upsert, touch, rename } = useAssistantConversations();
  const pendingPromptRef = useRef<PendingPrompt | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const onToggle = useCallback((): void => {
    setCollapsed((prev) => !prev);
  }, []);

  const onNew = useCallback((): void => {
    navigate('/assistant');
  }, [navigate]);

  const onSelect = useCallback(
    (conversationId: string): void => {
      navigate(`/assistant/${conversationId}`);
    },
    [navigate],
  );

  const onStart = useCallback(
    async (text: string): Promise<void> => {
      const conversation = await createAssistantConversation();
      upsert(conversation);
      pendingPromptRef.current = { id: conversation.id, text };
      navigate(`/assistant/${conversation.id}`);
    },
    [navigate, upsert],
  );

  const onReplyComplete = useCallback(
    (conversationId: string): void => {
      touch(conversationId, new Date().toISOString());
    },
    [touch],
  );

  return (
    <div className={styles.layout}>
      <aside className={collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}>
        <AssistantSidebar
          conversations={conversations}
          status={status}
          error={error}
          activeId={id ?? null}
          collapsed={collapsed}
          onToggle={onToggle}
          onNew={onNew}
          onSelect={onSelect}
        />
      </aside>
      <main className={styles.main}>
        {id === undefined ? (
          <StartView onStart={onStart} />
        ) : (
          <ConversationView
            key={id}
            conversationId={id}
            pendingPromptRef={pendingPromptRef}
            onReplyComplete={() => onReplyComplete(id)}
            onTitle={(title) => rename(id, title)}
          />
        )}
      </main>
    </div>
  );
}
