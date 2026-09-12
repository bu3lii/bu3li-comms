import { useCallStore } from "../stores/callStore";
import { useAudioSettingsStore } from "../stores/audioSettingsStore";
import { createPeerConnection } from "./peerConnection";
import { sendAnswer, sendCallJoin, sendCallLeave, sendIceCandidate, sendOffer } from "./signaling";

/**
 * Orchestrates one mesh voice call: acquires the mic, opens a direct
 * RTCPeerConnection to every other participant, and tears everything down
 * on leave/end. UI-relevant state lives in useCallStore; the connections
 * and local stream themselves are plain instance state here, the same
 * pattern as the RealtimeSocket singleton — they're not serializable and
 * nothing needs to react to the RTCPeerConnection object itself changing.
 *
 * Glare avoidance for "who offers first" is deterministic: of any two
 * participants, the one with the lexicographically smaller user id sends
 * the offer.
 */
class CallManager {
  private selfUserId: string | null = null;
  private conversationId: string | null = null;
  private localStream: MediaStream | null = null;
  private readonly peers = new Map<string, RTCPeerConnection>();

  setSelfUserId(userId: string): void {
    this.selfUserId = userId;
  }

  async start(conversationId: string): Promise<void> {
    await this.acquireLocalStream();
    this.conversationId = conversationId;
    useCallStore.getState().setOutgoing(conversationId);
    sendCallJoin(conversationId);
  }

  async accept(): Promise<void> {
    const conversationId = useCallStore.getState().conversationId;
    if (!conversationId) return;

    await this.acquireLocalStream();
    this.conversationId = conversationId;
    sendCallJoin(conversationId);
  }

  /** Declining before ever joining — nothing to tell the server, just reset local UI. */
  decline(): void {
    useCallStore.getState().reset();
  }

  leave(): void {
    const conversationId = this.conversationId ?? useCallStore.getState().conversationId;
    if (conversationId) {
      sendCallLeave(conversationId);
    }
    this.teardown();
  }

  toggleMute(): void {
    const nextMuted = !useCallStore.getState().isMuted;
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    useCallStore.getState().setMuted(nextMuted);
  }

  handleCallCreated(conversationId: string, callerId: string): void {
    if (useCallStore.getState().status !== "idle") return;
    useCallStore.getState().setIncoming(conversationId, callerId);
  }

  handleCallEnded(conversationId: string): void {
    if (this.conversationId !== conversationId) return;
    this.teardown();
  }

  async handleCallJoined(conversationId: string, participants: string[]): Promise<void> {
    if (this.conversationId !== conversationId || !this.selfUserId) return;

    useCallStore.getState().setParticipants(participants);

    for (const participantId of participants) {
      if (participantId === this.selfUserId || this.peers.has(participantId)) continue;

      const pc = this.openPeerConnection(participantId);

      if (this.selfUserId < participantId) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (offer.sdp) sendOffer(conversationId, participantId, offer.sdp);
      }
    }
  }

  handleCallLeft(conversationId: string, userId: string, participants: string[]): void {
    if (this.conversationId !== conversationId) return;
    this.closePeer(userId);
    useCallStore.getState().setParticipants(participants);
    useCallStore.getState().removeRemoteStream(userId);
  }

  async handleOffer(conversationId: string, fromUserId: string, sdp: string): Promise<void> {
    if (this.conversationId !== conversationId) return;

    const pc = this.peers.get(fromUserId) ?? this.openPeerConnection(fromUserId);
    await pc.setRemoteDescription({ type: "offer", sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (answer.sdp) sendAnswer(conversationId, fromUserId, answer.sdp);
  }

  async handleAnswer(conversationId: string, fromUserId: string, sdp: string): Promise<void> {
    if (this.conversationId !== conversationId) return;
    await this.peers.get(fromUserId)?.setRemoteDescription({ type: "answer", sdp });
  }

  async handleIceCandidate(conversationId: string, fromUserId: string, candidate: RTCIceCandidateInit): Promise<void> {
    if (this.conversationId !== conversationId) return;
    try {
      await this.peers.get(fromUserId)?.addIceCandidate(candidate);
    } catch {
      // A candidate arriving before the remote description is set is a benign race; drop it.
    }
  }

  private async acquireLocalStream(): Promise<void> {
    if (this.localStream) return;

    const deviceId = useAudioSettingsStore.getState().inputDeviceId;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    });
    useCallStore.getState().setLocalStream(this.localStream);
  }

  private openPeerConnection(participantId: string): RTCPeerConnection {
    const pc = createPeerConnection();
    this.peers.set(participantId, pc);

    this.localStream?.getTracks().forEach((track) => {
      if (this.localStream) pc.addTrack(track, this.localStream);
    });

    pc.addEventListener("icecandidate", (event) => {
      if (event.candidate && this.conversationId) {
        sendIceCandidate(this.conversationId, participantId, event.candidate.toJSON());
      }
    });

    pc.addEventListener("track", (event) => {
      const [stream] = event.streams;
      if (stream) useCallStore.getState().setRemoteStream(participantId, stream);
    });

    return pc;
  }

  private closePeer(participantId: string): void {
    this.peers.get(participantId)?.close();
    this.peers.delete(participantId);
  }

  private teardown(): void {
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    this.conversationId = null;
    useCallStore.getState().reset();
  }
}

export const callManager = new CallManager();
