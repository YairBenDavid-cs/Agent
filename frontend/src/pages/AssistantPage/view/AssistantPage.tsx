import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog';
import { ToastViewport } from '@/shared/ui/Toast/ToastViewport';
import { useToasts } from '@/shared/ui/Toast/useToasts';
import {
  createAssistantConversation,
  deleteAssistantConversation,
  renameAssistantConversation,
} from '../domain/assistant/api/assistantApi';
import { useAssistantConversations } from '../domain/assistant/hooks/useAssistantConversations';
import { useConversationEvents } from '../domain/assistant/hooks/useConversationEvents';
import { useGarminSync } from '../domain/garmin/useGarminSync';
import type { ConversationMode, PendingPrompt } from '../domain/assistant/types/assistant';
import { AssistantSidebar } from '../components/AssistantSidebar/view/AssistantSidebar';
import { StartView } from '../components/StartView/view/StartView';
import { ConversationView } from '../components/ConversationView/view/ConversationView';
import styles from './AssistantPage.module.css';

export function AssistantPage(): ReactElement {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // A "Discuss in chat" deep-link (e.g. from a program card) lands on the start
  // screen with a prefilled composer. Read it off the router state.
  const prefill = (location.state as { prefill?: string } | null)?.prefill;
  const { conversations, status, error, upsert, touch, rename, remove, clearAttention, refetch } =
    useAssistantConversations();
  const { toasts, showToast, dismiss } = useToasts();
  const pendingPromptRef = useRef<PendingPrompt | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const pendingDelete = useMemo(
    () => conversations.find((c) => c.id === pendingDeleteId) ?? null,
    [conversations, pendingDeleteId],
  );

  const garmin = useGarminSync({
    onSynced: () =>
      showToast('Garmin synced — open your Program to see new sessions.', () =>
        navigate('/program'),
      ),
    onError: (message) => showToast(message),
    onReconnect: () => {
      showToast('Garmin needs reconnecting.');
      navigate('/onboarding');
    },
  });

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
    async (text: string, mode: ConversationMode): Promise<void> => {
      const conversation = await createAssistantConversation(mode);
      upsert(conversation);
      pendingPromptRef.current = { id: conversation.id, text };
      navigate(`/assistant/${conversation.id}`);
    },
    [navigate, upsert],
  );

  // A trigger opened a pinned/flagged chat — pull the list so it surfaces
  // immediately (push path; no polling).
  useConversationEvents(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const onReplyComplete = useCallback(
    (conversationId: string): void => {
      touch(conversationId, new Date().toISOString());
      // The backend clears `attention` on the user's reply — mirror it locally
      // so the yellow dot disappears without a refetch.
      clearAttention(conversationId);
    },
    [touch, clearAttention],
  );

  const onRename = useCallback(
    (conversationId: string, title: string): void => {
      const previous = conversations.find((c) => c.id === conversationId)?.title;
      rename(conversationId, title);
      renameAssistantConversation(conversationId, title).catch(() => {
        if (previous !== undefined) {
          rename(conversationId, previous);
        }
        showToast('Could not rename the conversation.');
      });
    },
    [conversations, rename, showToast],
  );

  const onConfirmDelete = useCallback((): void => {
    const target = pendingDelete;
    setPendingDeleteId(null);
    if (!target) {
      return;
    }
    remove(target.id);
    if (target.id === id) {
      navigate('/assistant');
    }
    deleteAssistantConversation(target.id).catch(() => {
      upsert(target);
      showToast('Could not delete the conversation.');
    });
  }, [pendingDelete, remove, id, navigate, upsert, showToast]);

  return (
    <div className={styles.layout}>
      <aside className={collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar}>
        <AssistantSidebar
          conversations={conversations}
          status={status}
          error={error}
          activeId={id ?? null}
          collapsed={collapsed}
          garminVisible={garmin.visible}
          garminSyncing={garmin.syncing}
          garminLastSyncedAt={garmin.lastSyncedAt}
          onGarminSync={garmin.sync}
          onToggle={onToggle}
          onNew={onNew}
          onSelect={onSelect}
          onRename={onRename}
          onDelete={setPendingDeleteId}
          onToast={showToast}
        />
      </aside>
      <main className={styles.main}>
        {id === undefined ? (
          // Key on the prefill so a fresh deep-link re-seeds the composer even
          // if the start screen is already mounted.
          <StartView key={prefill ?? 'blank'} onStart={onStart} initialText={prefill} />
        ) : (
          <ConversationView
            key={id}
            conversationId={id}
            pendingPromptRef={pendingPromptRef}
            onReplyComplete={() => onReplyComplete(id)}
          />
        )}
      </main>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete conversation?"
        message={
          pendingDelete
            ? `"${pendingDelete.title}" and its messages will be permanently removed. This can't be undone.`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={onConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
