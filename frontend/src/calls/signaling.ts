import { realtimeSocket } from "../realtime/socket";

export function sendCallJoin(conversationId: string): void {
  realtimeSocket.send({ type: "call.join", data: { conversation_id: conversationId } });
}

export function sendCallLeave(conversationId: string): void {
  realtimeSocket.send({ type: "call.leave", data: { conversation_id: conversationId } });
}

export function sendOffer(conversationId: string, targetUserId: string, sdp: string): void {
  realtimeSocket.send({
    type: "webrtc.offer",
    data: { conversation_id: conversationId, target_user_id: targetUserId, sdp },
  });
}

export function sendAnswer(conversationId: string, targetUserId: string, sdp: string): void {
  realtimeSocket.send({
    type: "webrtc.answer",
    data: { conversation_id: conversationId, target_user_id: targetUserId, sdp },
  });
}

export function sendIceCandidate(conversationId: string, targetUserId: string, candidate: RTCIceCandidateInit): void {
  realtimeSocket.send({
    type: "webrtc.ice_candidate",
    data: { conversation_id: conversationId, target_user_id: targetUserId, candidate },
  });
}
