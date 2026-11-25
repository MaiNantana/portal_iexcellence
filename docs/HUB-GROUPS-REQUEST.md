# คำขอเพิ่มฟีเจอร์ Notification Hub: ส่งข้อความเข้า "กลุ่ม" LINE / Telegram

> **อัปเดต 2026-11-25:** ทีม Hub ทำกลุ่ม LINE เสร็จแล้วในรูปแบบ Admin API (`/api/admin`: departments, group-codes, groups, unlink, push-group, header `x-admin-key`) ไม่ใช่ตามสเปกด้านล่าง Portal ต่อกับ Admin API นั้นแล้ว (`src/lib/hub.ts`, env `HUB_ADMIN_URL` / `HUB_ADMIN_KEY`) · 1 บริษัท = 1 แผนกใน Hub มีได้หลายกลุ่ม · Telegram กลุ่มยังไม่มีใน Hub · Discord ใช้ webhook ของช่องเอง (`src/lib/groups.ts`) · เมื่อ Hub ทำ `/v1/group-keys` + `to.groups` ค่อยย้ายไปใช้ `/v1`

จาก: ทีม iExcellence Portal / TaskExcellence
ถึง: ทีม Notification Hub
วันที่: 2026-11-24

## 1. ต้องการอะไร

ตอนนี้ Hub ส่งได้เฉพาะแชทส่วนตัวของผู้ใช้ (`to.users`) ผู้บริหารต้องการให้แจ้งเตือนจาก Task (Automation) และ Portal ส่งเข้า **กลุ่ม LINE** และ **กลุ่ม Telegram** ของบริษัทได้ด้วย

ขอให้ Hub เพิ่ม 4 อย่าง:

1. ผูกกลุ่มกับบริษัทด้วย key ใช้ครั้งเดียว แบบเดียวกับการผูกผู้ใช้
2. API ดูรายชื่อกลุ่มที่ผูกกับบริษัท
3. API ยกเลิกการผูกกลุ่ม
4. `POST /v1/events` ส่งเข้ากลุ่มได้ (`to.groups`)

ฝั่ง Portal / Task จะทำหน้า admin "กลุ่มแจ้งเตือน" และ Action ใน Automation "ส่งเข้ากลุ่ม" ต่อจาก API ชุดนี้

## 2. API เดิมที่ Portal ใช้อยู่ (อ้างอิง ไม่ขอเปลี่ยน)

| # | API | ใช้ทำอะไร |
|---|---|---|
| 1 | `POST /v1/link-keys` | ขอ key ผูก LINE / Telegram ของผู้ใช้ |
| 2 | `POST /v1/events` | ส่งข้อความ (`event: "common.announcement"`, `to.users`, `data.text`, `Idempotency-Key`) |
| 3 | `POST /v1/users/{userId}/deactivate` | ยกเลิกการผูกของผู้ใช้ |
| 4 | `GET /v1/links?company=` | สถานะการผูกของผู้ใช้ทั้งบริษัท |

ทุก API ใหม่ขอให้ใช้รูปแบบเดิม คือ `Authorization: Bearer <HUB_API_KEY>`, JSON, `company` = slug ของบริษัท (1–64 ตัว `A-Z a-z 0-9 _ -`), error ตอบเป็น `{ "error": "<code>", "message": "..." }`

## 3. การผูกกลุ่ม (Group link)

### 3.1 ตั้งค่า LINE Official Account (ครั้งเดียว)

LINE Official Account Manager › Settings › Response settings: เปิด **"Allow account to join groups and multi-person chats"**

### 3.2 ขั้นตอนที่ผู้ใช้ทำ

1. admin ของบริษัทกด "เชื่อมกลุ่มใหม่" ใน Portal (Portal ตรวจสิทธิ์ admin เอง) แล้ว Portal เรียก API 5 ได้ key มา
2. admin เชิญบอท (Iex.Notification สำหรับ LINE หรือบอท Telegram) เข้ากลุ่ม
3. ใครก็ได้ในกลุ่มพิมพ์ `/link <KEY>`
4. บอทตอบในกลุ่มว่า `เชื่อมกลุ่ม "<ชื่อกลุ่ม>" กับ <ชื่อบริษัท> แล้ว ✓`

ใช้รูปแบบ `/link <KEY>` ทั้งสองช่องทาง เพราะบอท Telegram ที่เปิด privacy mode จะเห็นเฉพาะข้อความที่ขึ้นต้นด้วย `/`

### 3.3 API 5: ขอ key ผูกกลุ่ม

```
POST /v1/group-link-keys
{
  "company": "ixcl",
  "companyName": "iExcellence",
  "requestedBy": { "userId": "<Portal user id>", "email": "admin@acme.com" }
}
```

ตอบ `201`:

```json
{ "key": "K7P2QX", "expiresAt": "2026-11-24T10:15:00Z", "command": "/link K7P2QX" }
```

- อายุ 15 นาที ใช้ได้ครั้งเดียว ผูกได้ 1 กลุ่ม (เหมือน API 1)
- key ควรสั้นพอพิมพ์ในมือถือได้ เช่น 6–8 ตัว ไม่มีตัวที่สับสนกัน (0/O, 1/I)

### 3.4 สิ่งที่ Hub ต้องทำตอนได้รับ `/link <KEY>` ในกลุ่ม

- รับได้ทั้ง LINE `source.type = "group"` และ `"room"` และ Telegram chat type `group` / `supergroup`
- key ถูกต้องและยังไม่หมดอายุ: บันทึกกลุ่มเป็นของ `company` นั้น
  - เก็บ: `groupId` ของ Hub (สร้างใหม่ เช่น `grp_…` ห้ามส่งรหัสกลุ่มของ LINE / Telegram ออกมา), channel, รหัสกลุ่มจริง, ชื่อกลุ่ม, ผู้ขอ key, เวลา
  - ชื่อกลุ่ม: LINE ใช้ `GET /v2/bot/group/{groupId}/summary` (room ไม่มีชื่อ ใช้ "LINE chat") Telegram ใช้ `chat.title`
- key ผิด / หมดอายุ / ใช้แล้ว: ตอบในกลุ่ม `key ไม่ถูกต้องหรือหมดอายุ กรุณาขอใหม่จาก Portal`
- กลุ่มที่ผูกกับบริษัท A อยู่แล้ว แล้วมี `/link` ของบริษัท B: ผูกเพิ่มได้ (กลุ่มเดียวรับของหลายบริษัทได้) โดยแยกเป็นคนละ `groupId`
- ข้อความอื่นในกลุ่ม: **ไม่ตอบอะไรเลย** (กันบอทรบกวนกลุ่ม)

### 3.5 เหตุการณ์ที่ต้องจัดการ

| เหตุการณ์ | ต้องทำ |
|---|---|
| LINE `leave` / Telegram บอทถูกเตะออก (`my_chat_member` → `left` / `kicked`) | ตั้งสถานะกลุ่มเป็น `left` ไม่ลบข้อมูล |
| บอทถูกเชิญกลับเข้ากลุ่มเดิม | ยังเป็น `left` จนกว่าจะ `/link` ใหม่ |
| Telegram group อัปเกรดเป็น supergroup (`migrate_to_chat_id`) | อัปเดตรหัสกลุ่มจริง `groupId` ของ Hub คงเดิม |

## 4. API 6: รายชื่อกลุ่มของบริษัท

```
GET /v1/groups?company=ixcl
```

```json
{
  "groups": [
    {
      "groupId": "grp_8f3k2",
      "channel": "line",
      "name": "ทีมซ่อมบำรุง",
      "status": "connected",
      "memberCount": 18,
      "linkedAt": "2026-11-24T10:05:00Z",
      "linkedBy": { "userId": "<Portal user id>", "email": "admin@acme.com" }
    }
  ]
}
```

- `status`: `connected` | `left`
- `memberCount`: LINE ใช้ `GET /v2/bot/group/{groupId}/members/count` Telegram ใช้ `getChatMemberCount` (cache ได้ ไม่ต้องสดทุกครั้ง) Portal จะแสดงให้ admin เห็นว่าส่ง 1 ครั้งจะกินโควตาเท่าไร (ดูข้อ 7)

## 5. API 7: ยกเลิกการผูกกลุ่ม

```
POST /v1/groups/{groupId}/unlink
{ "company": "ixcl", "leave": true }
```

- `groupId` ต้องเป็นของ `company` นั้น ไม่ใช่ตอบ `404 not_found`
- `leave: true`: ให้บอทออกจากกลุ่มด้วย (LINE `POST /v2/bot/group/{groupId}/leave`, Telegram `leaveChat`) ถ้ากลุ่มนั้นไม่ได้ผูกกับบริษัทอื่นอยู่
- ตอบ `{ "unlinked": true }`

## 6. ส่งเข้ากลุ่ม: ขยาย `POST /v1/events`

เพิ่ม `to.groups` (ส่งคู่กับ `to.users` ในครั้งเดียวได้):

```json
{
  "company": "ixcl",
  "companyName": "iExcellence",
  "event": "common.announcement",
  "to": { "users": [], "groups": ["grp_8f3k2"] },
  "data": { "text": "[ixcl] ซ่อมแอร์ ชั้น 3: สถานะ → อนุมัติ\nhttps://pmo.iexcellence.cloud/?ws=…" },
  "ref": "task-automation"
}
```

ตอบ (เพิ่ม `groups` ข้าง `recipients` เดิม):

```json
{
  "messageId": "msg_…",
  "recipients": [],
  "groups": [
    { "group": "grp_8f3k2", "status": "sent", "channel": "line", "memberCount": 18 }
  ]
}
```

- `status`: `sent` | `left` (บอทไม่อยู่ในกลุ่มแล้ว) | `not_found` (ไม่ใช่กลุ่มของบริษัทนี้) | `failed` (+ `error`)
- `Idempotency-Key` ใช้กฎเดิม: key ซ้ำห้ามส่งซ้ำ
- ไม่เกิน 50 กลุ่มต่อครั้ง
- ข้อความเหมือนแชทส่วนตัว ขอให้ลิงก์ในข้อความแตะได้ (Portal เติม `openExternalBrowser=1` ให้ลิงก์ของเราอยู่แล้ว)
- บันทึกการส่งกลุ่มลงหน้า admin ของ Hub (delivery log) เหมือนการส่งปกติ

## 7. เรื่องโควตา LINE (สำคัญ)

LINE OA นับข้อความ push เข้ากลุ่มตาม **จำนวนสมาชิกในกลุ่ม** ส่งเข้ากลุ่ม 18 คน 1 ครั้ง = 18 ข้อความ ขอให้ Hub:

- ใส่ `memberCount` ในผลการส่ง (ข้อ 6) และในรายชื่อกลุ่ม (ข้อ 4)
- ถ้าเป็นไปได้ เพิ่ม `GET /v1/quota` คืนค่าจาก LINE `GET /v2/bot/message/quota` และ `/quota/consumption` เพื่อให้ Portal แสดงโควตาคงเหลือของเดือน
- เมื่อ LINE ตอบว่าโควตาหมด (429 / `You have reached your monthly limit`) ให้คืน `status: "failed"`, `error: "quota_exceeded"`

## 8. ความปลอดภัย

- กลุ่มผูกได้ด้วย key ที่ Portal ขอเท่านั้น บอทที่ถูกเชิญเข้ากลุ่มเฉย ๆ จะไม่ได้รับข้อความของบริษัทใด
- `groupId` ของ Hub ใช้ได้เฉพาะกับ `company` ที่ผูกไว้ ห้ามส่งข้ามบริษัท
- ไม่ส่งรหัสกลุ่มจริงของ LINE / Telegram ออกนอก Hub

## 9. ทดสอบรับงาน

1. ขอ key แล้ว `/link KEY` ในกลุ่ม LINE: บอทตอบยืนยัน และ `GET /v1/groups` เห็นกลุ่มเป็น `connected` พร้อมชื่อ
2. ใช้ key เดิมซ้ำในกลุ่มอื่น: ถูกปฏิเสธ
3. `POST /v1/events` ด้วย `to.groups`: ข้อความเข้ากลุ่ม ลิงก์แตะได้ ผลตอบ `sent` และ `memberCount`
4. เรียกซ้ำด้วย `Idempotency-Key` เดิม: ไม่ส่งซ้ำ
5. เตะบอทออกจากกลุ่ม แล้วส่งอีกครั้ง: ผลเป็น `left` และ `GET /v1/groups` เป็น `left`
6. `groupId` ของบริษัท A ส่งในนาม `company` B: ผลเป็น `not_found`
7. ทำข้อ 1–5 ซ้ำกับกลุ่ม Telegram
8. `POST /v1/groups/{id}/unlink` พร้อม `leave: true`: บอทออกจากกลุ่ม

## 10. ติดต่อ

ถ้ารูปแบบ API ข้างบนไม่สะดวกกับโครงสร้าง Hub ปรับได้ ขอแค่ให้มีความสามารถตามข้อ 1 ครบ แล้วส่งเอกสาร API จริงกลับมา ทีม Portal จะต่อฝั่ง Portal / Task ให้
