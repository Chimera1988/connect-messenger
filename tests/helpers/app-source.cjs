const fs=require('node:fs'),path=require('node:path');
// Legacy source-contract checks span the actual modules after extraction. Each
// file occurs once; runtime/SQL/browser behavior is tested independently.
module.exports=()=>[
 'app/page.tsx','lib/chat/attachments.ts','lib/chat/use-inbox.ts','lib/chat/model.ts','components/chat/Primitives.tsx',
 'components/chat/VoicePlayer.tsx','components/chat/AvatarEditor.tsx',
 'lib/chat/media-preview.ts','components/chat/VideoMessages.tsx','components/chat/VideoNoteRecorder.tsx'
].map(file=>fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8')).join('\n');
