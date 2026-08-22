# PixelTrade — แดชบอร์ด AI Trading

หน้า pixel-art สำหรับติดตามทีม AI เทรด BTC/ETH โดยแยกหน้าจอสาธารณะออกจาก private execution gateway ที่ถือกุญแจและบังคับกฎความเสี่ยง

> ระบบนี้ไม่รับประกันผลตอบแทน รุ่นแรกเป็นเพียง simulation ส่วน V2 ด้านล่างคือสถาปัตยกรรมสำหรับวัดผลจริงอย่างจำกัดและตรวจสอบย้อนหลังได้

## V2: private AI trading gateway

```text
Hyperliquid market/account data
            ↓
4-model evidence committee
            ↓
deterministic volatility + risk gate
            ↓
SHADOW | TESTNET | LIVE_MICRO
            ↓
entry → confirm fill → stop + take profits
            ↓
append-only journal + daily circuit breakers
```

ทีม AI ใช้โมเดลชุดเดียวกับ Orbit Trading:

- Qwen 3.7 Plus — lead crypto analyst
- DeepSeek V4 Pro — bear/liquidation auditor
- GLM 5.2 — independent evidence reviewer
- MiniMax M3 — BTC/ETH regime strategist

AI ไม่มีสิทธิ์กำหนดขนาด position, leverage หรือข้าม stop-loss เอง การซื้อเกิดได้เมื่อทั้ง 4 โมเดลอ้างอิงหลักฐานที่ส่งให้ครบ, เห็นตรงกัน, confidence อย่างน้อย 70 และผ่าน risk engine อีกชั้น หากโมเดลหรือข้อมูลขาด ระบบเลือก `HOLD`

หน้า Crypto ดึง equity, withdrawable balance, perpetual positions, unrealized P&L และ spot balances จริงจาก Hyperliquid ผ่าน gateway แบบอ่านอย่างเดียว ค่าเริ่มต้นใช้ public view account เดิมของโปรเจกต์ ส่วน execution account ต้องตั้งแยกต่างหากเสมอ

### โหมดการทำงาน

- `SHADOW` — วิเคราะห์และบันทึกผล แต่ไม่สร้างคำสั่งซื้อขาย
- `TESTNET` — ส่งคำสั่งไป Hyperliquid testnet
- `LIVE_MICRO` —เงินจริง จำกัดทุนเริ่มต้นตามค่าเริ่มต้นที่ $100, risk 0.25% ต่อครั้ง, loss limit 1% ต่อวัน, 1 position, 1× leverage และไม่เกิน 3 entries ต่อวัน

`AUTO_RUN_ENABLED` ปิดไว้เป็นค่าเริ่มต้น และ `LIVE_MICRO` ต้องผ่านทั้ง mode, private API wallet และคำยืนยันเงินจริงแยกกัน หน้า GitHub Pages ไม่มี private key, token หรือ endpoint สำหรับเลือก side/size/leverage

### เริ่มใช้งาน

```bash
npm install
cp .env.example .env
npm run check
npm run dev:gateway
```

เริ่มจาก `SHADOW` แล้วจึง `TESTNET` ก่อน `LIVE_MICRO` เสมอ ห้ามส่ง private key ผ่านแชตหรือเก็บใน Git กำหนดค่าใน `.env` บนเครื่อง/เซิร์ฟเวอร์ส่วนตัวเท่านั้น ดูรายละเอียดด้านความปลอดภัยใน [SECURITY.md](SECURITY.md)

### ขอบเขตที่ต้องพิสูจน์ก่อนเงินจริง

- รัน SHADOW และ TESTNET จนครอบคลุม fill บางส่วน, การตัดการเชื่อมต่อ, stale data และ stop/TP ทุกเส้นทาง
- ยืนยัน asset precision และ trigger-order behavior กับ testnet
- ตรวจ journal และ daily baseline ทุกวัน; baseline วันเดียวกันรีเซ็ตไม่ได้
- ใช้ API wallet แยกที่จำกัดเงิน และถอนเงินไม่ได้
- เครื่อง live นี้ติดตั้ง process supervisor และ protection watchdog ทุก 30 วินาทีแล้ว โดย watchdog ตรวจว่า BTC/ETH long ทุก position มี reduce-only stop และ take-profit; หาก protection ขาด ระบบจะยกเลิก protection ที่ค้างและส่ง emergency reduce-only close ส่วนการแจ้งเตือนใช้หน้า dashboard และ journal log

## หน้าเว็บ Crypto

ห้อง pixel-art เป็น visualization ของทีม Crypto เท่านั้น การเดินของตัวละครและการคลิกสถานีไม่สามารถส่งคำสั่งซื้อขายได้ ตัว execution gateway ทำงานแยกต่างหากและอยู่ภายใต้ risk engine

![PixelTrade Dashboard](assets/room.png)

## โปรเจคนี้คืออะไร?

PixelTrade แสดงทีม AI สำหรับ BTC/ETH พร้อมสถานะ gateway, พอร์ต Hyperliquid, ราคาตลาด และระบบป้องกันความเสี่ยงในสไตล์ pixel-art

## ฟีเจอร์หลัก

- **Crypto team visualization** — AI agents 6 ตัวเดินระหว่างสถานี BTC, ETH, committee, risk และ execution
- **ติดตามพอร์ตจริงแบบอ่านอย่างเดียว** — equity, withdrawable, positions และ P&L จาก Hyperliquid
- **คลิกสถานีได้** — คลิกสถานีไหนก็ได้เพื่อส่ง agent ที่ใกล้ที่สุดไปทำงานทันที
- **แยก display จาก execution** — Pause, speed และ reset บนหน้าเว็บไม่เปลี่ยนสถานะการเทรดจริง
- **ประวัติการเทรด** — สงวนไว้สำหรับ verified crypto execution events เท่านั้น
- **Settings** — ปรับเฉพาะ animation และการแสดงผล

## วิธีรัน

ไม่ต้อง build — เปิดในเบราว์เซอร์ได้เลย

```bash
# Clone โปรเจค
git clone <your-repo-url>
cd pixeltrade-live

# เปิด index.html ในเบราว์เซอร์โดยตรง
# หรือใช้ local dev server
npx serve .
```

จากนั้นเปิด `http://localhost:3000`

## โครงสร้างโปรเจค

```
├── index.html          # จุดเริ่มต้น — โหลดทุกไฟล์ผ่าน Babel standalone
├── app.jsx             # Root component และ crypto visualization loop
├── crypto-team.jsx     # ทีมและสถานี Crypto
├── crypto-room.jsx     # ห้อง pixel-art ของทีม Crypto
├── pixel-sprite.jsx    # ตัวช่วยเรนเดอร์ pixel sprite
├── sidebar.jsx         # แผงขวา: gateway, พอร์ต, ราคา และทีม Crypto
├── views.jsx           # หน้า History และ Settings
├── hyperliquid-data.js # ข้อมูลตลาดและพอร์ตแบบอ่านอย่างเดียว
├── gateway-client.js   # สถานะ private gateway
├── ui-utils.js         # ตัวช่วยการแสดงผล
├── styles.css          # สไตล์ทั้งหมด (ธีมมืด สไตล์ pixel)
└── assets/
    └── room.png        # ภาพพื้นหลังห้อง
```

## Visualization ทำงานอย่างไร?

แต่ละ agent มี **phase** ดังนี้: `idle → walking → working → idle`

- **idle** — agent รอสักครู่แล้วเลือกสถานีตามระดับ display activity
- **walking** — agent เดินไปยังสถานีด้วยความเร็วคงที่
- **working** — agent แสดงกิจกรรมที่สถานี โดยไม่ส่งคำสั่งและไม่แก้ยอดเงินจริง

## เทคโนโลยีที่ใช้

- **React 18** (โหลดผ่าน CDN ไม่ต้องมี bundler)
- **Babel Standalone** (แปลง JSX ในเบราว์เซอร์)
- CSS ล้วน สไตล์ pixel พร้อมฟอนต์ `Pixelify Sans` และ `VT323`
- Private TypeScript gateway สำหรับ execution และ risk controls

## การควบคุม

| ปุ่ม | การทำงาน |
|---|---|
| Pause display / Resume display | เปิด/ปิดการเคลื่อนไหวบนหน้าจอเท่านั้น |
| 1× / 2× / 4× | ความเร็ว animation เท่านั้น |
| คลิกสถานี | ส่ง agent ที่ว่างใกล้ที่สุดไปทำงาน |
| Settings → Reset display | ล้างกิจกรรมบนหน้าจอ ไม่กระทบ live engine |

## การทดสอบ

```bash
npm run check
```

## License

MIT
