import { useRef } from "react";
import { CopyButton, type CopyFeedback } from "../../components/ui/Snippet";
import { SidevoiceMark } from "../../components/ui/Icons";
import "./agent-message.css";

/* The phrase to say to an agent, on one line, as a command palette's: the Sidevoice mark at its start, the phrase in the
 * text colour, and its copy button at the end, vertically centred — the landing's message for the agent (its How it works
 * step 3), which the operator chose for the app (2026-11-08). It copies as a Quote does (the same CopyButton: a ✓, the
 * words said to a screen reader, the text selected when the clipboard refuses), and a long phrase wraps under itself.
 * The button is nearly transparent until the pointer is over the line or the keyboard is on the button, and stronger on
 * a touch screen: that is the stylesheet's alone, so the button is always there, in the tab order and named. */
export function AgentMessage({ text, label, feedback }: { text: string; label: string; feedback?: CopyFeedback }) {
  const phrase = useRef<HTMLParagraphElement>(null);
  return (
    <div className="agent-message">
      <blockquote className="agent-message-box">
        <SidevoiceMark className="agent-message-mark" size={20} />
        <p className="agent-message-text" ref={phrase}>{text}</p>
      </blockquote>
      <CopyButton text={text} label={label} feedback={feedback} target={phrase} />
    </div>
  );
}
