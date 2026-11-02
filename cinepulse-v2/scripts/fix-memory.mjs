import fs from 'fs';

let memory = fs.readFileSync('lib/ai/chat/memory.ts', 'utf8');
memory = memory.replace(
  'const summary = `[Earlier conversation context — ${olderMessages.length} older messages]\\n${summarySnippets}`;',
  'const summary = `Earlier conversation summary (${olderMessages.length} older messages):\\n${summarySnippets}`;'
);
fs.writeFileSync('lib/ai/chat/memory.ts', memory, 'utf8');
console.log('Updated summary in memory.ts');
