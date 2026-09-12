import { z } from "zod";
import { messageSchema } from "../types/message";

const messageDeletedSchema = z.object({
  message_id: z.string(),
  conversation_id: z.string(),
});

const messageReadSchema = z.object({
  message_id: z.string(),
  user_id: z.string(),
  conversation_id: z.string(),
  read_at: z.string(),
});

const typingSchema = z.object({
  user_id: z.string(),
  conversation_id: z.string(),
});

const presenceSchema = z.object({
  user_id: z.string(),
});

const presenceSnapshotSchema = z.object({
  online_user_ids: z.array(z.string()),
});

const callCreatedSchema = z.object({
  conversation_id: z.string(),
  caller_id: z.string(),
});

const callParticipantsChangedSchema = z.object({
  conversation_id: z.string(),
  user_id: z.string(),
  participants: z.array(z.string()),
});

const callEndedSchema = z.object({
  conversation_id: z.string(),
});

/** Matches what `RTCIceCandidate.prototype.toJSON()` produces. */
const iceCandidateInitSchema = z.object({
  candidate: z.string().optional(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});

const webrtcSdpSchema = z.object({
  conversation_id: z.string(),
  from_user_id: z.string(),
  sdp: z.string(),
});

const webrtcIceCandidateSchema = z.object({
  conversation_id: z.string(),
  from_user_id: z.string(),
  candidate: iceCandidateInitSchema,
});

/** Server -> client event payload schemas, keyed by envelope `type`. */
export const realtimeEventSchemas = {
  "message.created": messageSchema,
  "message.updated": messageSchema,
  "message.deleted": messageDeletedSchema,
  "message.read": messageReadSchema,
  "typing.started": typingSchema,
  "typing.stopped": typingSchema,
  "user.online": presenceSchema,
  "user.offline": presenceSchema,
  "presence.snapshot": presenceSnapshotSchema,
  "call.created": callCreatedSchema,
  "call.joined": callParticipantsChangedSchema,
  "call.left": callParticipantsChangedSchema,
  "call.ended": callEndedSchema,
  "webrtc.offer": webrtcSdpSchema,
  "webrtc.answer": webrtcSdpSchema,
  "webrtc.ice_candidate": webrtcIceCandidateSchema,
} as const;

export type RealtimeEventType = keyof typeof realtimeEventSchemas;

type RealtimeEventMap = {
  [K in RealtimeEventType]: z.infer<(typeof realtimeEventSchemas)[K]>;
};

export type RealtimeEvent = {
  [K in RealtimeEventType]: { type: K; data: RealtimeEventMap[K] };
}[RealtimeEventType];

const envelopeSchema = z.object({
  type: z.string(),
  data: z.unknown(),
});

function isRealtimeEventType(type: string): type is RealtimeEventType {
  return type in realtimeEventSchemas;
}

/** Parses and validates a raw WebSocket payload. Returns null on anything malformed or unrecognized. */
export function parseRealtimeEvent(raw: unknown): RealtimeEvent | null {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success || !isRealtimeEventType(envelope.data.type)) {
    return null;
  }

  const schema = realtimeEventSchemas[envelope.data.type];
  const data = schema.safeParse(envelope.data.data);
  if (!data.success) {
    return null;
  }

  return { type: envelope.data.type, data: data.data } as RealtimeEvent;
}

/** Client -> server events this app emits. */
export type OutgoingEvent =
  | { type: "typing.started"; data: { conversation_id: string } }
  | { type: "typing.stopped"; data: { conversation_id: string } }
  | { type: "message.read"; data: { message_id: string } }
  | { type: "call.join"; data: { conversation_id: string } }
  | { type: "call.leave"; data: { conversation_id: string } }
  | { type: "webrtc.offer"; data: { conversation_id: string; target_user_id: string; sdp: string } }
  | { type: "webrtc.answer"; data: { conversation_id: string; target_user_id: string; sdp: string } }
  | {
      type: "webrtc.ice_candidate";
      data: { conversation_id: string; target_user_id: string; candidate: RTCIceCandidateInit };
    };
