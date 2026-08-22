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
- ยังไม่ควรเปิด unattended live จนมี process supervisor, alerting และ order reconciliation watchdog

## หน้าเว็บเดิม

ส่วนห้อง pixel-art ด้านล่างยังคงไว้เป็น visualization เท่านั้น การเดินของตัวละครไม่สามารถส่งคำสั่งซื้อขายได้

![PixelTrade Dashboard](assets/room.png)

## โปรเจคนี้คืออะไร?

PixelTrade แสดงภาพสำนักงานเทรดเสมือนจริง ที่มี AI agents เดินไปมาระหว่างสถานีทำงาน นั่งวิเคราะห์ และส่งคำสั่งซื้อขาย — ทั้งหมดเรนเดอร์ในสไตล์ pixel-art ย้อนยุค ดูพอร์ตโตหรือร่วงได้แบบเรียลไทม์

## ฟีเจอร์หลัก

- **ซิมูเลชันสด** — AI agents 6 ตัว เดินระหว่าง 11 สถานี (Trading Desk, Analytics Bay, Signal Garden, R&D Pod ฯลฯ)
- **ติดตามพอร์ตแบบเรียลไทม์** — ยอดเงิน, P&L, และกราฟ equity อัปเดตทุก tick
- **คลิกสถานีได้** — คลิกสถานีไหนก็ได้เพื่อส่ง agent ที่ใกล้ที่สุดไปทำงานทันที
- **ปรับความเร็ว** — รันที่ 1×, 2×, หรือ 4×
- **หน้า Analysis** — แผง วิเคราะห์ตลาดในแอป
- **ประวัติการเทรด** — บันทึกทุกการซื้อขาย พร้อม ticker, จำนวน, ราคา และ P&L
- **Settings** — เปิด/ปิด autopilot, animation, สี, ป้ายชื่อ agent และระดับความก้าวร้าว

## วิธีรัน

ไม่ต้อง build — เปิดในเบราว์เซอร์ได้เลย

```bash
# Clone โปรเจค
git clone <your-repo-url>
cd ai-agents

# เปิด index.html ในเบราว์เซอร์โดยตรง
# หรือใช้ local dev server
npx serve .
```

จากนั้นเปิด `http://localhost:3000`

## โครงสร้างโปรเจค

```
├── index.html          # จุดเริ่มต้น — โหลดทุกไฟล์ผ่าน Babel standalone
├── app.jsx             # Root component: state, simulation loop, การเชื่อมต่อทั้งหมด
├── sim.jsx             # สถานี, ticker, การสร้าง outcome, logic ของ agent
├── room.jsx            # เรนเดอร์ห้อง pixel-art พร้อม sprite ของ agent
├── pixel-sprite.jsx    # ตัวช่วยเรนเดอร์ pixel sprite
├── sidebar.jsx         # แผงขวา: ยอดเงิน, P&L, กราฟ equity, การแจ้งเตือน
├── views.jsx           # หน้า History และ Settings
├── analysis.jsx        # หน้าวิเคราะห์ตลาด
├── analysis-model.js   # โมเดลข้อมูลการวิเคราะห์
├── styles.css          # สไตล์ทั้งหมด (ธีมมืด สไตล์ pixel)
└── assets/
    └── room.png        # ภาพพื้นหลังห้อง
```

## ระบบซิมูเลชันทำงานอย่างไร?

แต่ละ agent มี **phase** ดังนี้: `idle → walking → working → idle`

- **idle** — agent รอสักครู่แล้วเลือกสถานีตาม **ระดับความก้าวร้าว** (ยิ่งสูง ยิ่งเทรดมาก พักน้อยลง)
- **walking** — agent เดินไปยังสถานีด้วยความเร็วคงที่
- **working** — agent ใช้เวลาทำงานที่สถานีและสร้าง outcome (เทรด, วิเคราะห์, เขียน note ฯลฯ)

outcome ส่งผลต่อยอดเงินในพอร์ตรวม การเทรดมีโอกาสชนะประมาณ 66% พร้อม P&L แบบสุ่ม

## เทคโนโลยีที่ใช้

- **React 18** (โหลดผ่าน CDN ไม่ต้องมี bundler)
- **Babel Standalone** (แปลง JSX ในเบราว์เซอร์)
- CSS ล้วน สไตล์ pixel พร้อมฟอนต์ `Pixelify Sans` และ `VT323`
- ไม่มี backend — ทุกอย่างรันฝั่ง client

## การควบคุม

| ปุ่ม | การทำงาน |
|---|---|
| ⏸ Pause / ▶ Resume | เปิด/ปิด autopilot |
| 1× / 2× / 4× | ความเร็วของซิมูเลชัน |
| คลิกสถานี | ส่ง agent ที่ว่างใกล้ที่สุดไปทำงาน |
| Settings → Reset | รีเซ็ตซิมูเลชันกลับเป็น Day 1 |

## การทดสอบ

```bash
node --experimental-vm-modules tests/analysis-model.test.js
```

## License

MIT
