# csreyting.uz (DEMO)

CS2 matchlari natijalaridan yulduz, daraja va reyting hisoblaydigan sayt + desktop ilova qobig'i.
Hozirgi versiyada match ma'lumotlari qo'lda kiritiladi yoki tasodifiy yaratiladi.

## Sayt/serverni ishga tushirish (npm install kerak emas)

```bash
node server.js
```

Brauzerda: http://localhost:3000 — "Demo kirish" bilan ism yozib kiring. Node.js 18+ kerak.

## Qoidalar (`server.js` boshida sozlanadi)

- **Joylashtirish:** dastlabki 10 match. Shu matchlardagi o'rtacha ko'rsatkichga (ADR 40%, K/D 35%, g'alaba 25%) qarab boshlang'ich reyting 0–50 yulduz beriladi.
- **Keyin:** har g'alaba **+2**, har mag'lubiyat **−2** yulduz (0–50 oralig'ida).
- **Joylashtirish davomida** ko'rinadigan yulduz: g'alaba × 2 (vaqtincha).
- **Darajalar:** 1 Bronza (0–10), 2 Kumush (11–20), 3 Oltin (21–30), 4 Platina (31–40), 5 Master (41–50) — FACEIT 10-level ekvivalenti.
- **Jadval:** yulduz bo'yicha, teng bo'lsa oxirgi 10 matchdagi ko'rsatkich bo'yicha. Top 10 / Top 100 / Top 1000. Birinchi ishga tushishda 120 ta demo o'yinchi yaratiladi.

## Desktop ilova (Electron qobig'i)

Bu qism shu yerda sinab ko'rilmagan (workspace'da npm yopiq edi). O'z kompyuteringizda:

```bash
node server.js                  # bir terminalda
cd desktop && npm install
npm start                       # ilova oynasi ochiladi
npm run dist                    # Windows o'rnatuvchi (.exe) yig'ish
```

Boshqa serverga ulash: `RATING_URL=https://sizning-domen.uz npm start`.

## Steam bilan kirish

Steam bilan kirish `localhost:3000` da ham ishlaydi. Saytni internetga chiqarganda esa domen (https) kerak bo'ladi:

```bash
PUBLIC_URL=https://sizning-domen.uz STEAM_API_KEY=XXXX node server.js
```

`STEAM_API_KEY` ixtiyoriy (nom va avatar uchun): https://steamcommunity.com/dev/apikey

## Nikneym va FACEIT

- Steam bilan kirganda nikneym va avatar Steam profilingizdan o'zi olinadi (profil ochiq bo'lsa; API kalit shart emas).
  Profil yopiq bo'lsa yoki xato bo'lsa, tepadagi ✎ tugmasi bilan nikni qo'lda yozasiz.
- FACEIT ELO va darajasi: https://developers.faceit.com saytidan bepul API kalit oling va
  `FACEIT_API_KEY=XXXX node server.js` deb ishga tushiring. Demo akkauntlarda namuna qiymat ko'rsatiladi.

## Demo: qo'ldagi pichoq

Profil kartasidagi **🔪 Demo** varag'ida qo'l pichoqni ushlab turadi. Tanlanadi: pichoq (8 tur), qoplama, qo'lqop, dastak.
Tanlov avtomatik saqlanadi, profil kartasida ko'rinadi, «🔍 Ko'rish» tugmasi pichoqni aylantiradi.
Rasmlar o'zimiz chizgan soddalashtirilgan SVG (Valve rasmlari emas). Haqiqiy Steam inventarini ulash alohida ish.

## Profil, nikneym, Premium

- Tepada **«Ko'rish»** tugmasi profilni ochadi. Profil kartasida 3 ta varaq: Reyting, Profil (K/D va boshqa statistika, Steam ID, FACEIT, sozlamalar), Premium.
- **Nikneym:** oyda 1 marta bepul o'zgartiriladi, Premium'da cheklov yo'q. Davlat (bayroq) Profil varag'ida tanlanadi.
- **Premium ($2 / 30 kun):** animatsiyali banner (tayyor bannerlar yoki GIF), nikni cheklovsiz o'zgartirish, ★ PREMIUM belgisi.
- Hozir Premium **demo**: tugma to'lovsiz yoqadi. O'chirish: `PREMIUM_DEMO=0 node server.js` (to'lov tizimi ulanmaguncha sotib olib bo'lmaydi).
  Haqiqiy to'lov (Click, Payme yoki karta) uchun alohida integratsiya kerak.
- **GIF kategoriyalari** (avtomobil, qo'rqinchli, qizlar, bolalar, o'yin, memlar) GIPHY orqali ishlaydi: https://developers.giphy.com saytidan bepul kalit oling va
  `GIPHY_API_KEY=XXXX node server.js` deb ishga tushiring. Kalitsiz Premium egalari GIF havolasini qo'lda qo'yadi (faqat giphy, tenor, imgur).
  Kontent darajasi: qizlar/bolalar/avtomobil/memlar — PG, qo'rqinchli/o'yin — PG-13.

## Keyingi qadamlar

1. CS2 serverida plagin (CounterStrikeSharp) match natijasini `POST /api/match/add` ga o'xshash API ga avtomatik yuborsin (kills, deaths, assists, adr, win, map).
2. Matchmaking: navbat, jamoa tuzish, serverga `steam://connect/...` orqali ulash.
3. Anti-cheat: server tomonida shubhali statistika, demo tekshiruvi, akkaunt talablari, shikoyatlar.
4. Haqiqiy bazaga o'tish (SQLite/Postgres), admin panel.

## v3 o'zgarishlari

- Sahifalar (Reyting, Profil, Demo, Premium) pastdagi shaffof "shisha" panelga ko'chdi.
- Reyting jadvali: botlar "🤖 Namuna" belgisi bilan; haqiqiy o'yinchilar alohida o'rin (#) oladi; 100 ta haqiqiy o'yinchi bo'lgach botlar jadvaldan yo'qoladi.
- Jadvaldagi o'yinchini bossangiz profili ochiladi (`/u/<id>`). Profilni yashirish sozlamasi bor.
- Premium: o'z rasmini banner qilish (havola), barcha pichoq skinlari (bepul: Po'lat, Moviy po'lat, Karbon), oltin ramka.
- Joylashtirish tugagach Premium oynasi bir marta chiqadi.
- Narx $2.99. `PUBLIC_URL` berilsa Premium demo avtomatik o'chadi (qo'lda yoqish: `PREMIUM_DEMO=1`).

## v4

- **Demo varag'i:** MM highlight videolari (YouTube/Streamable havolasi bilan; bepul 3 ta, Premium 10 ta), oxirgi highlight'lar lentasi, o'yinchi qidirish, videoga shikoyat (3 ta shikoyatdan keyin yashiriladi).
- Pichoq ko'rgazmasi Profil varag'iga ko'chdi.

## v5

- Pastdagi panelda Profil yo'q: u tepadagi «Ko'rish» orqali ochiladi. «Chiqish» tepadagi «⋯» menyusiga ko'chdi, u yerda promokod maydoni ham bor.
- Promokodlar: `PROMO_CODES="KOD:kun:limit,KOD2:kun:limit" node server.js` (masalan `WELCOME7:7:100`). Har o'yinchi har kodni bir marta ishlatadi. Demo rejimda sinov uchun `DEMO7` bor.

## v6: MM demolari

1. Saytda ⋯ menyusidan «🔑 Ilova kaliti» ni oling.
2. `desktop/config.json` yarating: `{"token": "KALIT", "folder": "...\\csgo\\replays"}` (folder ixtiyoriy).
3. `watch.bat` ni ishga tushiring (yoki Electron ilova ochilganda o'zi ishlaydi). Tahlil uchun `@laihoe/demoparser2` o'rnatiladi; o'rnatilmasa demo tahlilsiz ro'yxatga tushadi.
4. CS2'da MM matchdan keyin **Watch → Your Matches** orqali demoni yuklab oling; ilova uni topib, saytga yuboradi (fayl emas, faqat natija).

## v7

- Pichoq ko'rgazmasi (Demo: qo'lingizga qurol oling) UI'dan olib tashlandi, shuningdek profildagi pichoq belgisi va Premium ro'yxatidagi skin bandi.

## v8

- «Profilni tahrirlash» (davlat yonida): nikneym, davlat, bio, banner rasmi (Premium, qurilmadan yuklash), profilni yashirish. Eski «Sozlamalar» kartasi shunga ko'chdi.
- Highlight videolar bo'limi olib tashlandi.
- Yaratuvchi (admin): Steam ID `76561198678043895` (boshqa ID: `CREATOR_ID=...`). Jadvaldagi va profildagi «⋯» menyusi: hamma uchun «Jalaba qilish» (5 ta turli jalabadan keyin 24 soat avtomatik ban), yaratuvchi uchun Premium berish, Ban berish, Banni olib tashlash.
- Ban paytida o'ynalgan matchlar saqlanadi, lekin yulduzlar ban tugagach qo'shiladi.

## v9

- Banner sozlamalari (tayyor animatsiya, GIF, rasm havolasi, qurilmadan rasm yuklash) Premium varag'idan «Profilni tahrirlash» oynasiga ko'chdi. Faqat Premium egalariga ochiq.

## v10

- Loyiha nomi: csreyting.uz. Yaratuvchi akkaunt umrbod Premium'ga ega. GIF kategoriyalari va jadvaldagi ikonkalar olib tashlandi; bot haqida ogohlantirish jadval tepasida.

## v11: Google qidiruv (SEO)

Saytda bosh sahifa va har bir profil uchun sarlavha, tavsif, canonical va Open Graph teglari, `/robots.txt` va `/sitemap.xml` (faqat haqiqiy, yashirilmagan o'yinchilar) bor. Bot va yashirin profillar indekslanmaydi.
Google'ga qo'shish tartibi:
1. Saytni haqiqiy manzilga chiqaring: `PUBLIC_URL=https://csreyting.uz` (HTTPS kerak).
2. https://search.google.com/search-console da «URL prefix» bilan https://csreyting.uz ni qo'shing, «HTML tag» usulini tanlab, berilgan `content` qiymatini `GOOGLE_SITE_VERIFICATION=...` sifatida serverga bering va tasdiqlang.
3. Sitemaps bo'limiga `sitemap.xml` ni yuboring.
Indekslanish odatda bir necha kundan bir necha haftagacha davom etadi, kafolati yo'q.
