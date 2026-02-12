export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  jsx_snapshot: string | null;
  jsx_valid: boolean | null;
}

export type RendererStatus = "idle" | "transpiling" | "rendered" | "error";

/** Full conversation structure matching the Rust Conversation type */
export interface Conversation {
  schema_version?: number;
  id: string;
  title: string;
  tags: string[];
  favorite: boolean;
  created_at: string;
  updated_at: string;
  messages: Message[];
  current_html_path: string | null;
  thumbnail_path: string | null;
}

/** An app promoted to the APPTRAY desktop */
export interface PromotedApp {
  conversation_id: string;
  name: string;
  thumbnail_path: string | null;
  html_path: string;
  promoted_at: string;
}

/** Lightweight summary for library listing */
export interface ConversationSummary {
  id: string;
  title: string;
  tags: string[];
  favorite: boolean;
  created_at: string;
  updated_at: string;
  message_count: number;
  current_html_path: string | null;
  thumbnail_path: string | null;
  preview: string;
}
