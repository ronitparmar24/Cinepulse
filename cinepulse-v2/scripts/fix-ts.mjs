import fs from 'fs';

// Fix 1: lib/ai/chat/tools.ts
let tools = fs.readFileSync('lib/ai/chat/tools.ts', 'utf8');
tools = tools.replace('},,', '},');
fs.writeFileSync('lib/ai/chat/tools.ts', tools, 'utf8');
console.log('Fixed tools.ts');

// Fix 2: components/chat/ChatPanel.tsx
let panel = fs.readFileSync('components/chat/ChatPanel.tsx', 'utf8');
panel = panel.replace(
  "  const orbState: 'idle' | 'thinking' | 'streaming' =\n    activeTool ? 'thinking' : isLoading ? 'streaming' : 'idle';\n",
  ""
);
panel = panel.replace(
  "    deleteThread,\n  } = chat;",
  "    deleteThread,\n  } = chat;\n\n  const orbState: 'idle' | 'thinking' | 'streaming' =\n    activeTool ? 'thinking' : isLoading ? 'streaming' : 'idle';"
);
fs.writeFileSync('components/chat/ChatPanel.tsx', panel, 'utf8');
console.log('Fixed ChatPanel.tsx');
