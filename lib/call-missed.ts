/** Match ConnectCallsHub.missed(): an unanswered caller cancellation is
 * missed for the callee, but never for the caller. Declined, busy, failed,
 * and answered calls are not missed.
 */
export type MissedCallLike = {
  callee_id: string;
  status: string;
  created_at: string;
  answered_at?: string | null;
  ended_at?: string | null;
};
export function isMissedIncomingCall(call: MissedCallLike, recipientId: string, now = Date.now()): boolean {
  if (call.callee_id !== recipientId || !!call.answered_at) return false;
  if (call.status === 'missed') return true;
  if (call.status === 'ended') return !!call.ended_at;
  const started = Date.parse(call.created_at);
  if (!Number.isFinite(started)) return false;
  return call.status === 'ringing' && now - started > 60_000;
}
