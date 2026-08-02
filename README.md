# 販売 LP（GitHub Pages 用）

`lp/index.html` が販売ランディングページの原本。Tailwind CSS は CDN 読み込みで、
ビルド工程は無い（ファイルをブラウザで開けばそのまま確認できる）。

---

## 公開する前に必ず差し替えるもの

`index.html` の中に、まだ**確定していない値をプレースホルダで置いてある**。
このまま公開すると購入ボタンとお問い合わせが機能しない。

| プレースホルダ | 何を入れるか |
| --- | --- |
| `__LEMONSQUEEZY_CHECKOUT_URL__` | Lemon Squeezy の商品チェックアウト URL |
| `__SUPPORT_EMAIL__` | サポート窓口のメールアドレス |

> アプリ側の `src/lib/ui/tooltipText.ts` の `FEATURE_REQUEST_EMAIL` も
> `xxxx@xxx.com` のままなので、同じアドレスに揃えること。

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

## 中身のメモ

- 既定は英語表示。**日本語圏のブラウザなら自動で日本語**になり、
  右上のボタンで切り替えられる（選択は localStorage に残る）
- 価格・トライアル条件はアプリの実装と一致させてある
  （3 週間 / 10 銘柄 / $98 買い切り）。**片方だけ変えないこと**
- 免責文は `src/lib/legal/disclaimer.ts` の要約。文面を変えるときは両方直す
- 実績・利用者数・レビューといった裏付けの無い記載は入れていない
