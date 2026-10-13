import type { ConversationMessageKey } from "./en";

/** The conversation's own texts in Simplified Chinese. A missing key falls back to English. */
export const zhHans: Partial<Record<ConversationMessageKey, string>> = {
  "transcript.title": "文字记录",
  "transcript.close": "关闭文字记录",
  "transcript.message": "书面消息",
  "transcript.placeholder": "发送消息",
  "transcript.send": "发送",
  "transcript.sendLabel": "发送消息",
  "karaoke.playing": "正在播放这条回复",
  "messages.group": "来自 {name} 的消息",
  "messages.message": "{name}：{text}",
  "messages.interrupted": "{name}（已打断）：{text}",
  "messages.today": "今天",
  "messages.empty": "还没有任何内容。你说的话和智能体的回复会显示在这里。",
  "messages.yesterday": "昨天",
  "messages.listenAgain": "再听一遍",
  "messages.cancel": "取消发送",
  "messages.thinking": "对话正在处理你的消息",
  "messages.new": "新消息",
  "messages.latest": "转到末尾",
  "messages.toLatest": "转到对话末尾",
  "wave.listening": "正在听",
  "wave.listeningTitle": "正在听…",
  "wave.transcribing": "正在转写你说的话",
  "wave.transcribingTitle": "正在转写…",
};
