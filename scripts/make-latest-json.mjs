#!/usr/bin/env node
/**
 * ビルド成果物から `latest.json`（更新の配信ファイル）を組み立てる。
 *
 * **Tauri v2 は `latest.json` を自動生成しない。** 署名付きの成果物
 * （`*.sig`）は作られるので、それを読んでこのファイルを作る。
 *
 * 使い方:
 *   npm run tauri build            # 先に本番ビルド
 *   npm run release:manifest       # dist-release/latest.json を作る
 *
 * できたものを GitHub Releases（motojet-bit/stoq-releases）へ
 * インストーラーと一緒に上げる。**ファイル名は latest.json のまま**にすること
 * （エンドポイント URL が固定で latest.json を指しているため）。
 */
import { mkdir, readFile, readdir, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const BUNDLE = join(ROOT, "src-tauri", "target", "release", "bundle");
const OUT = join(ROOT, "dist-release");

/** GitHub Releases のダウンロード URL。タグは毎回上げ直す。 */
const REPO = "https://github.com/motojet-bit/stoq-releases/releases/download";

/** プラットフォームごとの成果物の探し方。 */
const TARGETS = [
  {
    platform: "windows-x86_64",
    dir: join(BUNDLE, "nsis"),
    match: (name) => name.endsWith("-setup.exe"),
  },
];

/**
 * GitHub がアセットに付ける名前へ直す。
 *
 * **アップロード時に空白はドットへ置き換えられる。**
 * ローカルのファイル名をそのまま（`%20` で）URL に書くと 404 になり、
 * 更新のダウンロードだけが静かに失敗する。
 */
function assetName(fileName) {
  return fileName.replace(/\s+/g, ".");
}

async function readVersion() {
  const conf = JSON.parse(
    await readFile(join(ROOT, "src-tauri", "tauri.conf.json"), "utf-8"),
  );
  return conf.version;
}

async function findArtifact(target) {
  if (!existsSync(target.dir)) return null;
  const names = await readdir(target.dir);
  const installer = names.find(target.match);
  if (!installer) return null;

  const signature = `${installer}.sig`;
  if (!names.includes(signature)) {
    throw new Error(
      `${installer} の署名（${signature}）がありません。` +
        "TAURI_SIGNING_PRIVATE_KEY を設定してビルドし直してください。",
    );
  }

  return {
    installer,
    signature: (await readFile(join(target.dir, signature), "utf-8")).trim(),
    path: join(target.dir, installer),
  };
}

async function main() {
  const version = await readVersion();
  const tag = `v${version}`;
  const platforms = {};

  await mkdir(OUT, { recursive: true });

  for (const target of TARGETS) {
    const found = await findArtifact(target);
    if (!found) {
      console.warn(`skip ${target.platform}: 成果物が見つかりません`);
      continue;
    }
    platforms[target.platform] = {
      signature: found.signature,
      url: `${REPO}/${tag}/${assetName(found.installer)}`,
    };
    await copyFile(found.path, join(OUT, found.installer));
    console.log(`ok  ${target.platform}  ${found.installer}`);
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error("成果物が 1 つも見つかりません。先に npm run tauri build を実行してください。");
  }

  const manifest = {
    version,
    notes: process.env.RELEASE_NOTES ?? "",
    pub_date: new Date().toISOString(),
    platforms,
  };

  await writeFile(join(OUT, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  console.log(`\nwrote ${join(OUT, "latest.json")}  (version ${version}, tag ${tag})`);
  console.log("この 2 つを GitHub Releases の同じタグへ上げてください。");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
