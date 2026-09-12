package messages

// allowedReactionEmojis restricts reactions to a small fixed palette rather
// than accepting arbitrary strings — sidesteps grapheme-cluster validation
// entirely and matches the "reaction picker with a few options" UX every
// chat app built on this pattern actually ships.
var allowedReactionEmojis = map[string]bool{
	"👍":  true,
	"❤️": true,
	"😂":  true,
	"😮":  true,
	"😢":  true,
	"🎉":  true,
}

func isAllowedReactionEmoji(emoji string) bool {
	return allowedReactionEmojis[emoji]
}

// ReactionSummary groups one emoji's reactions on a message with who left
// them, so the client can render a count and highlight the viewer's own.
type ReactionSummary struct {
	Emoji   string   `json:"emoji"`
	UserIDs []string `json:"user_ids"`
}
