# 時報bot

一日に一度、指定の時刻にメッセージを送信するbotです 使い方はコマンドセクションをご覧ください。

自宅鯖で動かしているため、よく落ちます。ご了承ください。

## 招待URL
https://discord.com/oauth2/authorize?client_id=1293583305794392084&permissions=2415930432&integration_type=0&scope=bot

## コマンド

### /setschedule
  時報を追加します

  オプション
  - time: (必須)追加する時報の時刻 HH:MMの形式で指定します 例: 12:00 22:22
  - message: (任意)追加する時報のメッセージ 設定しなかった場合デフォルトのメッセージが送信されます

### /scheduleinfo
  時報の情報を表示します
  /editscheduleや/deletescheduleで使用するidはこのコマンドで確認できます

### /editschedule
  時報を編集します

  オプション
  - id: (必須)編集する時報のID
  - time: (任意)編集する時報の時刻
  - message: (任意)送信するメッセージを変更します
  - channel: (任意)送信するチャンネルIDを変更します
  - isactive: (任意)時報のアクティブ状態を変更します (true, false)

  idは/scheduleinfoで確認できます

### /deleteschedule
  時報を削除します

  オプション
  - id: (必須)削除する時報のID

  idは/scheduleinfoで確認できます

### /omikuji
  おみくじを引きます

  オプション なし

  確率は以下の通りです
  - ぬべ吉: 1% (20000円)
  - 大吉: 8% (1000円)
  - 吉: 12% (500円)
  - 中吉: 16% (300円)
  - 小吉: 22% (200円)
  - 末吉: 22% (100円)
  - 凶: 12% (-50円)
  - 大凶: 5% (-100円)
  - ヌベキチ└(՞ةڼ◔)」: 2% (-300円)

  また、ぬべ吉、ヌベキチ└(՞ةڼ◔)」が出た場合はロールが付与されます。※ロールはbotがサーバーに参加した時に作成されます

### /coinflip
  お金をコイントスで賭けます

  オプション
  - bet: (必須)賭けるお金

  勝利すると賭け金の2倍のお金がもらえます

  1円から賭けられます

  最大賭け金は10000円です
