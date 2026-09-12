package realtime

import "sync"

// CallRegistry tracks which users are currently in a conversation's voice
// call. It's in-memory and ephemeral by design, same as WebSocket
// connections themselves — a server restart clears active calls, and
// nothing here is meant to be a call history.
type CallRegistry struct {
	mu           sync.RWMutex
	participants map[string]map[string]struct{}
}

func NewCallRegistry() *CallRegistry {
	return &CallRegistry{participants: make(map[string]map[string]struct{})}
}

// Join adds userID to conversationID's call and returns the full
// participant list afterward, plus whether this join is what started the
// call (it was empty immediately before).
func (c *CallRegistry) Join(conversationID string, userID string) (participants []string, started bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	set, exists := c.participants[conversationID]
	started = !exists || len(set) == 0
	if !exists {
		set = make(map[string]struct{})
		c.participants[conversationID] = set
	}
	set[userID] = struct{}{}

	return c.snapshotLocked(conversationID), started
}

// Leave removes userID from conversationID's call. If that empties the
// call, it's deleted and ended is true; otherwise participants holds who's
// left.
func (c *CallRegistry) Leave(conversationID string, userID string) (participants []string, ended bool) {
	c.mu.Lock()
	defer c.mu.Unlock()

	set, exists := c.participants[conversationID]
	if !exists {
		return nil, false
	}

	delete(set, userID)

	if len(set) == 0 {
		delete(c.participants, conversationID)
		return nil, true
	}

	return c.snapshotLocked(conversationID), false
}

type LeaveAllResult struct {
	ConversationID string
	Participants   []string
	Ended          bool
}

// LeaveAll removes userID from every call they're part of, used when their
// last WebSocket connection drops without an explicit call.leave.
func (c *CallRegistry) LeaveAll(userID string) []LeaveAllResult {
	c.mu.Lock()
	defer c.mu.Unlock()

	var results []LeaveAllResult

	for conversationID, set := range c.participants {
		if _, inCall := set[userID]; !inCall {
			continue
		}

		delete(set, userID)

		if len(set) == 0 {
			delete(c.participants, conversationID)
			results = append(results, LeaveAllResult{ConversationID: conversationID, Ended: true})
			continue
		}

		results = append(results, LeaveAllResult{
			ConversationID: conversationID,
			Participants:   c.snapshotLocked(conversationID),
		})
	}

	return results
}

func (c *CallRegistry) snapshotLocked(conversationID string) []string {
	set := c.participants[conversationID]
	ids := make([]string, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	return ids
}
