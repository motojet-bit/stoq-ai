# StoQ AI Analyzer — landing page

Source for <https://stoq-ai.com/>.

Served by GitHub Pages from `main` / `(root)`. The `CNAME` file in this
directory is what binds the custom domain — **do not delete it.** Removing it
sends the site back to `motojet-bit.github.io/stoq-ai/` and breaks every link
that points at the domain.

The old address still redirects, so existing links keep working.

StoQ AI Analyzer is a Windows desktop tool that collects corporate earnings
filings and summarises them with AI, so that reading them takes less time.
You bring your own API key, and the documents stay on your own machine.

| Page | | 直す場所 |
| --- | --- | --- |
| [`index.html`](./index.html) | Product page | この HTML を直接 |
| [`after-purchase.html`](./after-purchase.html) | 購入後の手順 | この HTML を直接 |
| [`terms.html`](./terms.html) | Terms of Use | 🔴 **`build-policy.mjs`** |
| [`privacy.html`](./privacy.html) | Privacy Policy | 🔴 **`build-policy.mjs`** |
| [`refund.html`](./refund.html) | Refund Policy | 🔴 **`build-policy.mjs`** |
| [`blog/`](./blog/index.html) | 更新履歴（リリースノート） | 🔴 **`build-blog.mjs`** |

Tailwind CSS is loaded from a CDN.

## 🔴 生成物を手で直さない

**法務ページ 3 枚と `blog/` 以下は生成物。** HTML を直しても、
次にビルダーを回した瞬間に元へ戻る（**過去に一度踏んでいる**）。

```bash
node build-policy.mjs   # terms / privacy / refund
node build-blog.mjs     # blog/index.html と記事
```

**枠（ヘッダー・フッター・言語切替・販売元の表示）は `lp-frame.mjs` が持つ。**
ここを直すと**両方に効く**ので、直したら 2 つとも回し直すこと。
販売元の表示は決済審査で見られる部分で、**片方だけ古いと食い違う。**

## 更新履歴（リリースノート）を足すとき

`build-blog.mjs` の `POSTS` の**先頭**に 1 件足して、`node build-blog.mjs`。
生成物もコミットする（GitHub Pages は静的ファイルしか配れない）。

- **免責は自動で入る。** 記事ごとに書かない（書き忘れが構造的に起きないように）
- **詳しさの程度**は `StockAnalyzer/docs/リリース手順.md` の
  「リリースノートの書き方」に従う。**GitHub Releases の本文と食い違わせない**

## お問い合わせフォームを置くとき

`lp-frame.mjs` の `CONTACT_FORM_URL` と `CONTACT_FORM_SERVICE` に入れて、
**両方のビルダーを回す。** それだけで、各ページの問い合わせ欄にボタンが出て、
プライバシーポリシーに「第三者を経由する」節が入る。

🔴 **URL だけ入れてサービス名を空にしない。**
プライバシーポリシーが「どこを経由するか」を書けないまま公開されることになる。
`mailto:` は残すこと（フォームが落ちたときに連絡手段がゼロになる）。

Application downloads are published separately, under
[`stoq-releases`](https://github.com/motojet-bit/stoq-releases/releases).

## リリースのたびに必要なこと

⚠ **いまダウンロードボタンは外してある**（配布を停止中。下の
「販売・配布を停止するとき・再開するとき」を参照）。以下は**再開したあとの話。**

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

## 販売・配布を停止するとき・再開するとき

**いま販売も配布も停止中**（販売 2026-09-20 〜 / 配布 2026-09-21 〜）。
`index.html` から購入ボタンとダウンロードボタンを外し、
「現在、販売・配布を停止しています / Sales and downloads are currently paused」を出している。

外したのは 4 か所。**再開するときは 4 つとも戻す。**

| 場所 | 外したもの |
| --- | --- |
| ヘッダー | 緑の「無料ダウンロード」ボタン |
| ヒーロー | 「$0 の無料トライアルを始める」「価格を見る」の 2 つ |
| 価格カード（無料） | 「Windows 版をダウンロード」 |
| 価格カード（買い切り） | 「ライフタイムライセンスを購入」 |
| `#download` 節 | インストーラーへの直リンク・見出し・トライアル仕様の緑枠 |

**戻し方は、それぞれの場所の HTML コメントに書いてある。**
同意ダイアログ（`#consent`）とその JS は**消さずに残してある**ので、
購入ボタンのリンクを戻すだけで「同意 → 決済」の流れが再び効く。

### 🔴 LP を閉じても、まだ手に入る経路が 2 つ残っている

**「LP から消えた＝もう誰も手に入らない」ではない。**
止めきりたいなら、この 2 つも別途ふさぐこと。

| 経路 | 状態 |
| --- | --- |
| SendOwl の商品ページ `https://sowl.co/p/wr9dp` | **生きている。**（意図的に放置・2026-09-21 の判断）URL を直接知っていれば今も買える |
| `stoq-releases` の GitHub リリース | **生きている。** フッターの「更新履歴」から辿れて、インストーラーも落とせる |

GitHub リリースを残しているのは、**すでに買った人が入れ直せなくなるほうが困る**から。
SendOwl のダウンロードリンクは購入から 24 時間で切れるので、
入れ直しの受け皿はここしかない。

完全に止めるなら、SendOwl は管理画面 → Products → 公開停止、
GitHub は `stoq-releases` を Private にするか、リリースを下書きへ戻す。
**どちらも、止めたあとシークレットウィンドウで開いて確かめること。**

### 再開するとき

1. **配布と決済を先に開ける。** LP を先に戻すと、その数分のあいだに
   来た人が死んだリンクへ落ちる
2. `index.html` の 4 か所のボタンを戻す（各所のコメントを見る）
3. 戻したあと、**実際にボタンを押して、決済ページとインストーラーまで
   行けることを確かめる**

## 価格を変えるとき

価格は **2 か所**にある。**ずれると、広告した額と請求額が食い違う。**

| 場所 | 何 |
| --- | --- |
| `index.html` の `USD $62` | 表示価格 |
| SendOwl の商品設定 | **実際に請求される額** |

### 🔴 順番を守る

**お客様が「広告より高く請求される」状態を、一瞬でも作らない。**

| | 順番 |
| --- | --- |
| **値上げ**（$62 → $67） | **① LP を先に直す → ② SendOwl** |
| **値下げ**（クーポン増額など） | **① SendOwl を先に直す → ② LP** |

どちらも「**安いほうが先に効く**」向き。逆にすると、その数分のあいだに買った人が
**表示より高い額を請求される。** 返金と信用の話になる。

### `$228` は動かさない

`$228` は「V1 リリース時の通常価格」として宣言してある。
**V0 のうちに動かす数字は `$62` のほうだけ。**

- `$62 → $67 → $72` と上げても、`$228` が据え置きなら
  「V0 特別価格・数量限定」という説明と矛盾しない
- **`$228` 自体を吊り上げると、それまでの二重価格表示が根拠を失う。**
  上げたいときは v2（別アプリ）で値付けし直す
  （`StockAnalyzer/docs/v2を別アプリとして出す.md`）
- ⚠ **V1 では宣言どおり実際に `$228` にすること。**
  「将来この価格になる」と書いた以上、そうしないと表示の裏付けが無くなる

### 変更は公開リポジトリの履歴に残る

このリポジトリは Public。価格を書き換えれば、
**その差分が日付つきで誰でも読める形で残る。** 消せない。
**戻したり刻んだりする前提で数字を決めること。**

---

Published under the trade name StoQ AI Analyzer.
Seller location: Chaiyaphum, Thailand.
Legal name and full address disclosed on request.
Contact: superpuzanoza@gmail.com
