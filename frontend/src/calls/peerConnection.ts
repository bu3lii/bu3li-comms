/**
 * STUN is always included, resolving most home/LAN NATs. A TURN server is
 * added on top when configured via env vars — without one, symmetric NATs
 * and locked-down corporate networks can't complete a call (see
 * ROADMAP.md's "TURN server" item and frontend/BACKEND_GAPS.md). The local
 * dev stack ships a coturn instance in docker-compose.yml; point these vars
 * at it (or a hosted TURN provider) to exercise that path.
 */
const STUN_SERVER: RTCIceServer = { urls: "stun:stun.l.google.com:19302" };

function turnServer(): RTCIceServer | null {
  const url = import.meta.env.VITE_TURN_URL;
  if (!url) {
    return null;
  }

  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;

  return { urls: url, username, credential };
}

function iceServers(): RTCIceServer[] {
  const turn = turnServer();
  return turn ? [STUN_SERVER, turn] : [STUN_SERVER];
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: iceServers() });
}
