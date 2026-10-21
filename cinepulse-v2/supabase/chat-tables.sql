-- CinePulse v9 Ask CinePulse Chatbot Tables & RLS Policies for Supabase

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view their own chat threads"
  ON chat_threads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own chat threads"
  ON chat_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat threads"
  ON chat_threads FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chat threads"
  ON chat_threads FOR DELETE
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT NOT NULL,
  tool_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feedback TEXT CHECK (feedback IN ('up', 'down'))
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages from their own threads"
  ON chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages into their own threads"
  ON chat_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update feedback on their own thread messages"
  ON chat_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM chat_threads
      WHERE chat_threads.id = chat_messages.thread_id
      AND chat_threads.user_id = auth.uid()
    )
  );
