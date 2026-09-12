import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { realtimeSocket, type ConnectionStatus } from "../realtime/socket";
import type { RealtimeEvent } from "../realtime/events";
import { addReactionLocal, insertOrReconcileMessage, removeById, removeReactionLocal, replaceIfNewer } from "../api/messageCache";
import { messagesQueryKey } from "./useMessages";
import { useConnectionStore } from "../stores/connectionStore";
import { usePresenceStore } from "../stores/presenceStore";
import { useTypingStore } from "../stores/typingStore";
import { useReadReceiptsStore } from "../stores/readReceiptsStore";
import { useToastStore } from "../stores/toastStore";
import { callManager } from "../calls/callManager";
import { useVoiceChannelStore } from "../stores/voiceChannelStore";
import { conversationsQueryKey } from "./useConversations";
import { serversQueryKey } from "./useServers";
import type { ChatMessage } from "../types/message";

/**
 * Establishes the single application WebSocket connection and wires
 * incoming events into TanStack Query's cache and the realtime stores.
 * Mount this exactly once, at the authenticated app shell.
 */
export function useRealtime(enabled: boolean): void {
  const queryClient = useQueryClient();
  const setStatus = useConnectionStore((s) => s.setStatus);
  const setOnline = usePresenceStore((s) => s.setOnline);
  const setTyping = useTypingStore((s) => s.setTyping);
  const setLastRead = useReadReceiptsStore((s) => s.setLastRead);
  const setVoiceChannelParticipants = useVoiceChannelStore((s) => s.setParticipants);
  const clearVoiceChannel = useVoiceChannelStore((s) => s.clear);
  const pushToast = useToastStore((s) => s.push);
  const wasDisrupted = useRef(false);

  useEffect(() => {
    if (!enabled) {
      realtimeSocket.disconnect();
      return;
    }

    function handleStatus(status: ConnectionStatus): void {
      if (status === "reconnecting" || status === "disconnected") {
        wasDisrupted.current = true;
      } else if (status === "connected" && wasDisrupted.current) {
        wasDisrupted.current = false;
        pushToast("Back online.", "success");
      }
      setStatus(status);
    }

    function handleEvent(event: RealtimeEvent): void {
      switch (event.type) {
        case "message.created": {
          const key = messagesQueryKey(event.data.conversation_id);
          queryClient.setQueryData<ChatMessage[]>(key, (old = []) => insertOrReconcileMessage(old, event.data));
          void queryClient.invalidateQueries({ queryKey: conversationsQueryKey() });
          break;
        }
        case "message.updated": {
          const key = messagesQueryKey(event.data.conversation_id);
          queryClient.setQueryData<ChatMessage[]>(key, (old = []) => replaceIfNewer(old, event.data));
          break;
        }
        case "message.deleted": {
          const key = messagesQueryKey(event.data.conversation_id);
          queryClient.setQueryData<ChatMessage[]>(key, (old = []) => removeById(old, event.data.message_id));
          void queryClient.invalidateQueries({ queryKey: conversationsQueryKey() });
          break;
        }
        case "typing.started":
          setTyping(event.data.conversation_id, event.data.user_id, true);
          break;
        case "typing.stopped":
          setTyping(event.data.conversation_id, event.data.user_id, false);
          break;
        case "user.online":
          setOnline(event.data.user_id, true);
          break;
        case "user.offline":
          setOnline(event.data.user_id, false);
          break;
        case "message.read":
          setLastRead(event.data.conversation_id, event.data.user_id, event.data.message_id);
          void queryClient.invalidateQueries({ queryKey: conversationsQueryKey() });
          break;
        case "message.reaction_added": {
          const key = messagesQueryKey(event.data.conversation_id);
          queryClient.setQueryData<ChatMessage[]>(key, (old = []) =>
            addReactionLocal(old, event.data.message_id, event.data.user_id, event.data.emoji),
          );
          break;
        }
        case "message.reaction_removed": {
          const key = messagesQueryKey(event.data.conversation_id);
          queryClient.setQueryData<ChatMessage[]>(key, (old = []) =>
            removeReactionLocal(old, event.data.message_id, event.data.user_id, event.data.emoji),
          );
          break;
        }
        case "presence.snapshot":
          for (const userId of event.data.online_user_ids) {
            setOnline(userId, true);
          }
          break;
        case "call.created":
          callManager.handleCallCreated(event.data.conversation_id, event.data.caller_id);
          break;
        case "call.joined":
          void callManager.handleCallJoined(event.data.conversation_id, event.data.participants);
          setVoiceChannelParticipants(event.data.conversation_id, event.data.participants);
          break;
        case "call.left":
          callManager.handleCallLeft(event.data.conversation_id, event.data.user_id, event.data.participants);
          setVoiceChannelParticipants(event.data.conversation_id, event.data.participants);
          break;
        case "call.ended":
          callManager.handleCallEnded(event.data.conversation_id);
          clearVoiceChannel(event.data.conversation_id);
          break;
        case "webrtc.offer":
          void callManager.handleOffer(event.data.conversation_id, event.data.from_user_id, event.data.sdp);
          break;
        case "webrtc.answer":
          void callManager.handleAnswer(event.data.conversation_id, event.data.from_user_id, event.data.sdp);
          break;
        case "webrtc.ice_candidate":
          void callManager.handleIceCandidate(event.data.conversation_id, event.data.from_user_id, event.data.candidate);
          break;
        case "server.member_added":
        case "server.member_removed":
        case "server.member_role_changed":
        case "server.channel_created":
        case "server.channel_deleted":
        case "server.channels_reordered":
        case "server.deleted":
        case "server.updated":
        case "server.role_changed":
          void queryClient.invalidateQueries({ queryKey: serversQueryKey() });
          if (event.type === "server.member_added" || event.type === "server.channel_created") {
            void queryClient.invalidateQueries({ queryKey: conversationsQueryKey() });
          }
          break;
      }
    }

    const unsubscribeEvents = realtimeSocket.onEvent(handleEvent);
    const unsubscribeStatus = realtimeSocket.onStatusChange(handleStatus);

    realtimeSocket.connect();

    return () => {
      unsubscribeEvents();
      unsubscribeStatus();
    };
  }, [
    enabled,
    queryClient,
    setStatus,
    setOnline,
    setTyping,
    setLastRead,
    setVoiceChannelParticipants,
    clearVoiceChannel,
    pushToast,
  ]);
}
