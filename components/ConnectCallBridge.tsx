'use client';
import ConnectAudioCalls from './ConnectAudioCalls';
import { useConnectSession } from './ConnectSessionProvider';

/** Mounted inside the app shell for its entire lifetime, independent of navigation. */
export default function ConnectCallBridge() {
  const {client,user,conversation}=useConnectSession();
  return <ConnectAudioCalls client={client} userId={user?.id||null}
    conversationId={conversation?.conversationId||null} peerId={conversation?.peerId||null}
    peerName={conversation?.peerName||'Собеседник'}/>;
}
