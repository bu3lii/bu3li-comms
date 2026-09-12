/**
 * STUN only — no TURN server. This resolves most home/LAN NATs but not
 * symmetric NATs or locked-down corporate networks. See BACKEND_GAPS.md.
 */
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}
