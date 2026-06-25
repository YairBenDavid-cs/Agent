
export interface AssistantConversation {
  id: string;
  type: 'assistant';
  title: string;
  lastMessageAt: string;
}

export type AssistantTurnRole = 'user' | 'assistant';

export interface AssistantTurn {
  id: string;
  conversationId: string;
  role: AssistantTurnRole;
  text: string;
  createdAt: string;
}

// A first prompt handed from the start screen to the conversation it just created,
// so the new conversation can auto-send it once after navigation.
export interface PendingPrompt {
  id: string;
  text: string;
}
