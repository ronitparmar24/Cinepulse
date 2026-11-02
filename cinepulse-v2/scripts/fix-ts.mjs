import fs from 'fs';

let panel = fs.readFileSync('components/chat/ChatPanel.tsx', 'utf8');

panel = panel.replace(
  'deleteThread,\r\n  } = chat;',
  "deleteThread,\r\n  } = chat;\r\n\r\n  const orbState: 'idle' | 'thinking' | 'streaming' =\r\n    activeTool ? 'thinking' : isLoading ? 'streaming' : 'idle';"
);
panel = panel.replace(
  'deleteThread,\n  } = chat;',
  "deleteThread,\n  } = chat;\n\n  const orbState: 'idle' | 'thinking' | 'streaming' =\n    activeTool ? 'thinking' : isLoading ? 'streaming' : 'idle';"
);

fs.writeFileSync('components/chat/ChatPanel.tsx', panel, 'utf8');
console.log('Fixed orbState in ChatPanel.tsx');
