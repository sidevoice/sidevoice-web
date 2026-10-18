# Issue 172 visual evidence

Raw Chromium screenshots from Web `v0.7.3` (`e2c4f10`) and this branch, captured at 1280 × 800 and 390 × 844 CSS pixels. The pairing code is a generated sample. No character assets were changed.

| View | Before | After |
| --- | --- | --- |
| Pairing, desktop | [Before](before-v0.7.3-desktop-pair-open.png) | [After](after-desktop-pair-open.png) |
| Pairing, phone | [Before](before-v0.7.3-phone-pair-open.png) | [After](after-phone-pair-open.png) |
| Listening, desktop | [Before](before-v0.7.3-desktop-transcript-listening.png) | [After](after-desktop-transcript-listening.png) |
| Listening, phone | [Before](before-v0.7.3-phone-transcript-listening.png) | [After](after-phone-transcript-listening.png) |
| Transcribing, phone | [Before](before-v0.7.3-phone-transcript-transcribing.png) | [After](after-phone-transcript-transcribing.png) |

The live transcript bubble was 347 px versus a 298 px final bubble on desktop, and 364 px versus a 313 px final bubble on phone. After the change, the live and final maximum widths are 298 px and 313 px respectively. [Long provisional text on phone](after-phone-long-provisional.png) and [its final message](after-phone-long-final.png) both measure 313 px; [desktop provisional](after-desktop-long-provisional.png) and [final](after-desktop-long-final.png) both measure 298 px. [Short provisional text on phone](after-phone-short-provisional.png) and [its final message](after-phone-short-final.png), plus [desktop provisional](after-desktop-short-provisional.png) and [final](after-desktop-short-final.png), stay content sized. An empty listening waveform keeps a visible bubble. The message viewport did not overflow horizontally in either size.

[Desktop transcript after a closed-panel arrival](after-desktop-transcript-arrival.png) and [phone transcript after a closed-panel arrival](after-phone-transcript-arrival.png) show the neutral “Go to the end” scroll control. The transcript entry keeps its normal “Show transcript” label and no unread dot or count. Opening the panel still reveals the new message. Existing private HTTP consent remains visible in the pairing screenshots.
