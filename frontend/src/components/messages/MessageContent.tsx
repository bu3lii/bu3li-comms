import type { ReactNode } from "react";

// Deliberately "lite": bold/italic/code/links/mentions only, no nesting, no
// code blocks — a rendering concern per ROADMAP.md, not a real markdown
// parser. Alternatives are tried in this order so "**bold**" is consumed by
// the bold branch before the italic branch gets a chance at its asterisks.
const TOKEN_PATTERN = "(`[^`\\n]+`)|(\\*\\*[^*\\n]+\\*\\*)|(\\*[^*\\n]+\\*)|(https?://[^\\s<]+)|(@[A-Za-z0-9_]+)";

/**
 * Renders message text with lightweight markdown formatting and @mention
 * highlighting. Safe by construction: every piece is pushed as a React
 * node/string, never through dangerouslySetInnerHTML, so there's no HTML
 * injection surface regardless of message content.
 */
export function MessageContent({ content, mentionUsernames }: { content: string; mentionUsernames: Set<string> }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  const tokenRe = new RegExp(TOKEN_PATTERN, "g");
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(content))) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    const [full, code, bold, italic, link, mention] = match;

    if (code) {
      nodes.push(
        <code key={key++} className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em]">
          {code.slice(1, -1)}
        </code>,
      );
    } else if (bold) {
      nodes.push(<strong key={key++}>{bold.slice(2, -2)}</strong>);
    } else if (italic) {
      nodes.push(<em key={key++}>{italic.slice(1, -1)}</em>);
    } else if (link) {
      nodes.push(
        <a
          key={key++}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline decoration-dotted hover:text-accent-strong"
        >
          {link}
        </a>,
      );
    } else if (mention) {
      const isKnownUser = mentionUsernames.has(mention.slice(1).toLowerCase());
      nodes.push(
        isKnownUser ? (
          <span key={key++} className="rounded bg-accent/15 px-1 font-medium text-accent">
            {mention}
          </span>
        ) : (
          mention
        ),
      );
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return <>{nodes}</>;
}
