# 販売 LP（GitHub Pages 用）

`lp/index.html` が販売ランディングページの原本。Tailwind CSS は CDN 読み込みで、
ビルド工程は無い（ファイルをブラウザで開けばそのまま確認できる）。

---

## 公開する前に必ず差し替えるもの

`index.html` に置いていたプレースホルダは**すべて実値に差し替え済み**。
下表は履歴として残す（再び差し替えが要るときの目印）。

| プレースホルダ | 何を入れるか |
| --- | --- |
| ~~`__LEMONSQUEEZY_CHECKOUT_URL__`~~ | 設定済み（Lemon Squeezy のチェックアウト URL） |
| ~~`__SUPPORT_EMAIL__`~~ | 設定済み（`superpuzanoza@gmail.com`） |

> アプリ側（`src/lib/ui/tooltipText.ts` の `FEATURE_REQUEST_EMAIL`）も
> 同じアドレスに揃えてある。片方だけ変えないこと。

ダウンロードボタンは `https://github.com/motojet-bit/stoq-releases/releases/latest`
を指している。**`stoq-releases` にリリースが 1 つも無い間は 404 になる**ので、
`docs/リリース手順.md` に従って先にリリースを作ること。

---

## GitHub Pages で公開する

このリポジトリにはまだリモートが無い。まずリモートを足す。

```bash
git remote add origin https://github.com/motojet-bit/<リポジトリ名>.git
git push -u origin main
```

### なぜ `/docs` ではなく専用ブランチなのか

GitHub Pages の「main / docs フォルダ」を選ぶと、**`docs/` の中身がすべて公開される**。
このリポジトリの `docs/` には設計メモ・改修記録・`リリース手順.md`（署名鍵の保管場所を書いてある）
が入っており、外に出すものではない。LP だけを載せた `gh-pages` ブランチを使う。

```bash
# LP だけを含む孤立ブランチを作って公開する
git subtree push --prefix lp origin gh-pages
```

うまくいかない場合（履歴の食い違いなど）は、作り直しでもよい。

```bash
git checkout --orphan gh-pages
git rm -rf .
git checkout main -- lp
mv lp/* lp/.nojekyll .
rmdir lp
git add -A && git commit -m "publish landing page"
git push -u origin gh-pages
git checkout main
```

そのうえで GitHub の **Settings → Pages** で
Source = `Deploy from a branch`、Branch = `gh-pages` / `(root)` を選ぶ。

公開 URL は `https://motojet-bit.github.io/<リポジトリ名>/` になる。
反映まで数分かかる。

---

## ヒーロー背景の差し替え

いまは仮の SVG（斜めから見たボケ感のあるチャート）を data URI で埋めてある。
GIF や写真に替えるときは、`.hero` の `--hero-image` の URL を差し替えるだけでよい。

```css
.hero { --hero-image: url("./hero.gif"); }
```

暗いオーバーレイ（`.hero::after`）が上に乗るので、**明るい画像に替えても文字は読める**。
動きを減らす設定（`prefers-reduced-motion`）の環境では、ぼかしと拡大を外している。

## 中身のメモ

- 既定は英語表示。**日本語圏のブラウザなら自動で日本語**になり、
  右上のボタンで切り替えられる（選択は localStorage に残る）
- 価格・トライアル条件はアプリの実装と一致させてある
  （3 週間 / 10 銘柄 / $62 買い切り）。**片方だけ変えないこと**
- 免責文は `src/lib/legal/disclaimer.ts` の要約。文面を変えるときは両方直す
- 実績・利用者数・レビューといった裏付けの無い記載は入れていない
- 「こんな方のためのツールです」の 2 枚（脱・初級者 / 中級者以上）は、
  左＝初心者、右＝中級者の順で固定。入れ替えるとリード文の流れが崩れる
- ダウンロード欄の SmartScreen 注意書きは、コード署名を導入したら削除してよい

## pricing-scenarios.html（内部検討用）

将来の価格（第 2 段階 $98 / $28 月、第 3 段階 $228 / $49 月）を並べた検討ページ。

- **index.html からはリンクしない。** gh-pages に置く以上 URL は誰でも踏めるので、
  検討中の価格が実売価格と取り違えられないよう  を入れてある
- 最上部の警告帯は消さないこと。スクリーンショットが独り歩きしても、必ずこの帯が写る
- 決済ボタンは置かない（検討中の価格で実際に買われるのを防ぐ）
- 価格を決めたら、このページは削除するか、決定内容に書き換える
