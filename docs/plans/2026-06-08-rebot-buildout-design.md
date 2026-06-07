# rebot 作り込み設計（PR-Agent 参考）

- 日付: 2026-06-08
- 期限: 2026-07-17
- 位置づけ: コードレビューエージェントの足がかり。ブランド重視。「出力の中身の質」で差別化する。

## 背景 / 現状

rebot は PR-Agent ライクな CLI の骨格ができている。

- コマンド: `describe` / `review` / `improve` / `all`
- 入力: `--diff-file` / `--pr`(gh) / `--base` / 既定の `git diff`
- LLM 実行: opencode SDK 経由（`createOpencode()` でローカルサーバを起動し `session.prompt`）
- 出力: Markdown を stdout に出すのみ（GitHub への投稿は未実装）
- 構成: DI ベースで各層が分離、単体テスト完備

## 優先順位

1. レビュー品質の深化（最優先）
2. 機能の横展開
3. 設定・基盤整備
4. GitHub 実投稿

## 主要な技術判断

### 判断1: 出力の構造化はプロンプト由来 JSON ではなく、ランタイム移行で得る

opencode SDK の `session.prompt` には次が無いことを一次情報（`@opencode-ai/sdk` の型定義）で確認した。

- ネイティブの構造化出力（`response_format` / JSON スキーマ強制）が無い
- ツール強制呼び出し（`tool_choice: required` 相当）がドキュメント化されていない
- `tools` は opencode 組込みツールの有効/無効のみ。カスタムツールは `.opencode/tool/*.ts` をファイルから読む方式で、`bun build --compile` した単一バイナリでの配布に摩擦がある

### 判断2: opencode を剥がし、Vercel AI SDK に移行する（Epic 0）

剥がす理由と、今やる理由:

- LLM 呼び出しは `runOpencodePrompt` という1関数＋DI の裏に隔離されており、置換面が小さい。後になるほど高くつく。
- Vercel AI SDK は `generateObject({ schema })` で **Zod 検証済みの構造化出力がネイティブ**。Epic A の手作り JSON パース/リペア層がほぼ不要になる。
- `generateText({ tools, toolChoice, stopWhen })` で **ツール呼び出し＋エージェントループ**。Epic B の文脈取得を自前の軽い read/grep ツールで実現できる。
- マルチプロバイダでモデル選択が容易。サーバ不要・軽量・コンパイル後も同一挙動。

### 判断3: opencode サブスク（opencode zen）は AI SDK から継続利用する

一次情報（opencode.ai/docs/zen）で確認:

- ローカル `auth.json` の `opencode-go`（`{type:"api", key:<67字>}`）が opencode zen のゲートウェイ API キー
- ベースURL `https://opencode.ai/zen/v1/`、API キー認証
- ドキュメントが `@ai-sdk/openai` / `@ai-sdk/openai-compatible` 対応を明記 → Vercel AI SDK から直接利用可能
- モデルは `opencode/<model-id>` 形式

→ AI SDK の openai-compatible プロバイダを `https://opencode.ai/zen/v1` ＋ opencode-go キーに向ければサブスク継続。実装時に `curl` で実疎通を1回確認する。

## アーキテクチャ方針

```
inputs(diff/pr/base) ─▶ buildPrompt ─▶ runModel(AI SDK)
                                          ├─ generateObject(schema=Zod)  … 構造化レビュー(Epic A)
                                          └─ generateText(tools, toolChoice) … 文脈取得ループ(Epic B)
                              structured result ─▶ renderMarkdown ─▶ stdout (将来: GitHub 投稿)
```

- `runOpencodePrompt` を `runModel` 抽象に置換（DI は維持し既存テストを移植）
- プロバイダ設定（baseURL / apiKey / model）は env と設定ファイルで解決

## エピック構成

### Epic 0: LLM ランタイム移行（opencode → AI SDK / zen 経由）【最初】

- 0-1: `ai` ＋ openai-compatible プロバイダ導入、zen baseURL＋opencode-go キー読込（疎通 curl 確認含む）
- 0-2: `runOpencodePrompt` を `runModel` 抽象に置換（DI 維持・既存テスト移植）
- 0-3: `--model` オプション＋既定モデル設定
- 0-4: opencode SDK 依存と関連コード撤去、README/CLAUDE 更新

### Epic A: 構造化レビュー基盤（`generateObject` で簡素化）

- A-1: レビュー結果スキーマ定義（Zod）— finding: file / line range / severity / category / description / suggestion
- A-2: `runModel` に `generateObject` 経路を追加（schema 検証込み）
- A-3: 構造化結果 → Markdown レンダラ（現行 passthrough を置換）
- A-4: 各コマンドのプロンプトを構造化スキーマ前提に改訂
- A-5: schema / レンダラ / 経路の単体テスト

### Epic B: 文脈取得による精度向上（`generateText` + tools で簡素化）

- B-1: 自前 read/grep ツールを定義し `generateText` のツールループに接続
- B-2: 実行ディレクトリ/リポジトリ文脈を渡しツールが辿れるように
- B-3: 「diff 外を読んで横断推論せよ」ガイドをプロンプトに追加
- B-4: ガードレール（トークン/時間/ツール反復の上限、`stopWhen`）
- B-5: サンプル PR での回帰確認（精度の簡易 eval）

### Epic C〜G（プレースホルダ。A/B の後に詳細化）

- Epic C: レビュー出力の充実（effort 見積り / security concerns / can_be_split / severity 整列 / describe の type・labels・walkthrough / improve のコミット可能提案）
- Epic D: 大きな diff の扱い（ファイル/ハンク分割・トークン予算ランキング・圧縮）
- Epic E: コマンド横展開（ask / ラベル自動付与 / changelog 更新 / 増分レビュー）
- Epic F: 設定・基盤整備（設定ファイル・モデル/プロバイダ設定・出力オプション）
- Epic G: GitHub 実投稿（サマリ＋インラインコメント・冪等更新・Action 連携）

## 依存関係（要点）

- Epic A / B は Epic 0（特に 0-2 の `runModel` 抽象）に依存
- Epic B は Epic A の構造化パイプラインに依存
- Epic C〜G は Epic A に依存（D は A、E/F は 0/A、G は A/F）

## YAGNI / スコープ外（今回）

- マルチプロバイダの全面対応（zen 経由でモデル選択できれば当面十分）
- 大 diff 圧縮の高度化（D は骨子のみ、深掘りは後続）
- GitHub Action 常駐運用（G は最後、まず手動投稿から）

## 未確定事項

- 既定モデルの選定（JSON 遵守・コスト・速度のバランス）
- finding の severity / category の語彙定義
- 文脈取得ループのコスト上限の具体値
