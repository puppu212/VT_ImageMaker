# VT ImageMaker

Java版のImageMakerとImageViewを統合したブラウザ版ツールです。

## 主な機能

- PNG・BMP素材の個別追加、フォルダ一括読込
- 素材のサムネイル一覧、検索、個別拡大表示
- `image.dat`＋`imagedata.dat`の読込と素材切り出し
- Shift_JISの`custom.txt`／`voice.txt`から日本語文字素材を再生成
- IndexedDBへの作業状態の自動保存と復元
- PWAインストール、オフライン起動、更新通知
- 素材の置換、削除
- 1024px／2048px幅の出力画像プレビュー
- 半透明維持／不透明化
- `image.dat`＋`imagedata.dat`、または`image2.dat`＋`imagedata2.dat`の出力

## 起動

```sh
cd VT_ImageTool
python3 -m http.server 4175
```

`http://localhost:4175`を開いてください。

## ソース構成

- `src/app.js`: 画面状態とユーザー操作の制御
- `src/formats.js`: DAT・BMPの解析と生成
- `src/image-io.js`: PNG・BMP・Canvasの入出力
- `src/text-assets.js`: Shift_JIS文字素材の解析
- `src/autosave.js`: 作業状態の自動保存制御
- `src/workspace-store.js`: IndexedDBへの読み書き
- `src/history.js`: 戻る・進むの履歴管理
- `src/dialogs.js`: 確認・復元ダイアログ
- `src/pwa.js`: PWAの登録、インストール、更新制御
- `sw.js`: オフライン用アプリキャッシュ

## PWA

GitHub PagesなどのHTTPS環境で公開すると、対応ブラウザでは「インストール」ボタンからアプリとして追加できます。通常のWeb版とPWA版は同じURLです。

## 現時点の範囲

Java版ImageMakerが自動生成するライフバーや数値画像は、今後の互換機能として追加予定です。
