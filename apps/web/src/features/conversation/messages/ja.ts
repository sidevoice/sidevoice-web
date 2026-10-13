import type { ConversationMessageKey } from "./en";

/** The conversation's own texts in Japanese. A missing key falls back to English. */
export const ja: Partial<Record<ConversationMessageKey, string>> = {
  "transcript.title": "文字起こし",
  "transcript.close": "文字起こしを閉じる",
  "transcript.message": "テキストメッセージ",
  "transcript.placeholder": "メッセージを送信",
  "transcript.send": "送信",
  "transcript.sendLabel": "メッセージを送信",
  "karaoke.playing": "この返答を再生中",
  "messages.group": "{name}からのメッセージ",
  "messages.message": "{name}：{text}",
  "messages.interrupted": "{name}（中断）：{text}",
  "messages.today": "今日",
  "messages.empty": "まだ何も話していません。あなたの発言とエージェントの返答がここに表示されます。",
  "messages.yesterday": "昨日",
  "messages.listenAgain": "もう一度聞く",
  "messages.cancel": "送信をキャンセル",
  "messages.thinking": "会話があなたのメッセージに取り組んでいます",
  "messages.new": "新着メッセージ",
  "messages.latest": "最新へ移動",
  "messages.toLatest": "会話の最後へ移動",
  "wave.listening": "聞き取り中",
  "wave.listeningTitle": "聞き取り中…",
  "wave.transcribing": "あなたの発言を文字起こししています",
  "wave.transcribingTitle": "文字起こし中…",
};
