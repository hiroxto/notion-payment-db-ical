# notion-payment-db-ical

Notion の還元系カレンダー DB を iCal にして Google カレンダーなどで見られるようにする Cloudflare Workers。


## セットアップ

.dev.vars.example を .dev.vars としてコピーしてキーを設定する。

```txt
cp .dev.vars.example .dev.vars
npm install
npm run dev
```

## worker-configuration.d.ts の生成

```txt
npm run cf-typegen
```

## License

MIT License
