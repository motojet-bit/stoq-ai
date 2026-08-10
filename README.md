# StoQ AI Analyzer — landing page

Source for <https://motojet-bit.github.io/stoq-ai/>.

StoQ AI Analyzer is a Windows desktop tool that collects corporate earnings
filings and summarises them with AI, so that reading them takes less time.
You bring your own API key, and the documents stay on your own machine.

| Page | |
| --- | --- |
| [`index.html`](./index.html) | Product page |
| [`terms.html`](./terms.html) | Terms of Use |
| [`privacy.html`](./privacy.html) | Privacy Policy |
| [`refund.html`](./refund.html) | Refund Policy |

Static HTML with no build step — open any file in a browser to view it.
Tailwind CSS is loaded from a CDN.

Application downloads are published separately, under
[`stoq-releases`](https://github.com/motojet-bit/stoq-releases/releases).

## リリースのたびに必要なこと

`index.html` のダウンロードボタンは、**バージョンを含まない固定名**を指している。

```
https://github.com/motojet-bit/stoq-releases/releases/latest/download/StoQ-AI-Analyzer-x64-setup.exe
```

`latest/download/` は最新リリースの**同名アセット**へ転送される仕組みなので、
バージョンを上げても LP 側は触らなくてよい。

🔴 **そのかわり、リリースを作るときに毎回この名前でもアップロードする。**

Tauri が吐くインストーラは `StoQ.AI.Analyzer_0.9.0_x64-setup.exe` のように
バージョン入りの名前になる。**同じファイルを `StoQ-AI-Analyzer-x64-setup.exe`
という名前でもう 1 つ**アセットに足すこと（中身は同一でよい）。

忘れるとダウンロードボタンが 404 になる。**リリース後に一度、
ボタンを実際に押して確かめる。**

---

Published under the trade name StoQ AI Analyzer.
Seller location: Chaiyaphum, Thailand.
Legal name and full address disclosed on request.
Contact: superpuzanoza@gmail.com
