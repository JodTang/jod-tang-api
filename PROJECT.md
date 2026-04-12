# Jod Tang Project Overview

## Project Summary

Jod Tang คือระบบบันทึกรายรับรายจ่ายส่วนบุคคลที่ใช้ LINE เป็นช่องทางหลักในการรับข้อมูลจากผู้ใช้ แล้วเก็บข้อมูลธุรกรรมไว้ในระบบกลางเพื่อให้ดู จัดการ และสรุปผลได้ผ่าน API

ภาพรวมแบบสั้นที่สุดคือ:

- ผู้ใช้ส่งข้อความใน LINE เพื่อบันทึกรายรับหรือรายจ่าย
- ระบบพยายามแปลงข้อความธรรมชาติให้เป็น transaction ที่มีโครงสร้าง
- ข้อมูลถูกจัดเก็บใน PostgreSQL
- ผู้ใช้หรือแอดมินสามารถเข้าถึงข้อมูลผ่าน REST API

โปรเจกต์นี้จึงไม่ใช่แค่ backend API อย่างเดียว แต่เป็นระบบการเงินส่วนบุคคลขนาดเล็กที่มีหลายชั้นทำงานร่วมกัน ได้แก่ LINE bot, AI parsing layer, REST API, auth layer และ database

## Main User Surfaces

### 1. LINE Bot

นี่คือช่องทางหลักของผู้ใช้ปลายทาง

ผู้ใช้สามารถ:

- ส่งข้อความธรรมดาเพื่อบันทึกรายการ
- ใช้คำสั่ง เช่น `/help`, `/join`, `/categories`, `/today`
- กด postback เพื่อเลือกหมวดหมู่ในบาง flow
- รับผลลัพธ์กลับเป็น text message หรือ flex message

LINE bot จึงเป็นทั้ง input interface และ lightweight UI ของระบบ

### 2. REST API

API เป็นแกนกลางสำหรับจัดการข้อมูลและเชื่อมต่อกับ client อื่น ๆ

หน้าที่หลักของ API:

- authentication
- จัดการ transaction
- จัดการ invite code
- เรียก Gemini แบบ authenticated
- จัดการค่า config บางอย่างของระบบ เช่น default Gemini model
- รับ webhook จาก LINE

นอกจากนี้ยังมี API docs สำหรับสำรวจ endpoint ของระบบ

## Core Product Flow

### Flow A: User onboarding

1. ผู้ใช้เริ่มต้นจาก LINE
2. ระบบสร้าง user แบบ `pending` เมื่อเจอคนใหม่
3. ผู้ใช้ใช้ `/join <code>` เพื่อ activate ผ่าน invite code
4. เมื่อผ่านแล้วสถานะ user จะกลายเป็น `active`

แนวคิดนี้ทำให้ระบบควบคุมการเข้าถึงได้แบบ invite-only

### Flow B: Record a transaction from LINE

1. ผู้ใช้ส่งข้อความเข้า LINE bot
2. ระบบแยกว่าเป็น command, postback หรือข้อความทั่วไป
3. ถ้าเป็นข้อความทั่วไป ระบบจะลอง parse ธุรกรรม
4. ถ้าเป็นข้อความรูปแบบธนาคารบางแบบ จะ parse ด้วย rule-based logic
5. ถ้าเป็นข้อความธรรมชาติทั่วไป จะส่งเข้า Gemini เพื่อแปลงเป็น structured transactions
6. ระบบบันทึก transaction ลง database
7. ส่ง flex message กลับเพื่อยืนยันผล

ตอนนี้ flow นี้รองรับทั้ง single transaction และหลาย transactions ในข้อความเดียว

### Flow C: Manage and review data

เมื่อข้อมูลถูกเก็บในระบบแล้ว ผู้ใช้หรือ client อื่นสามารถ:

- list transaction
- filter ตามวันที่ ประเภท หมวดหมู่ และ source
- ดู summary รวมรายรับ รายจ่าย และ net
- แก้ไข category หรือข้อมูล transaction ผ่าน API

## System Building Blocks

### 1. Fastify application shell

Fastify เป็น runtime หลักของระบบ โดยมีการ autoload ทั้ง plugins และ routes ทำให้โครงสร้างค่อนข้าง modular

สิ่งที่ Fastify app รับผิดชอบ:

- register plugins
- register routes
- auth / error handling
- expose API endpoints

### 2. Plugin-based architecture

ระบบใช้ plugin เป็นโครงสร้างหลักของ business capability ต่าง ๆ เช่น:

- auth
- cookie
- db
- line
- gemini
- repositories
- line handlers
- swagger / shared schema

ข้อดีของรูปแบบนี้คือแยก concern ชัด และทำให้ app services ถูก inject เข้า route หรือ handler ได้ง่าย

### 3. Repository layer

repository ทำหน้าที่เป็น data access abstraction เหนือ Drizzle/PostgreSQL เช่น:

- user repository
- transaction repository
- category repository
- invite code repository
- local auth credential repository
- app settings repository

ชั้นนี้คือจุดเชื่อมระหว่าง domain logic กับ database

### 4. AI parsing layer

Gemini ถูกใช้เป็น natural language parser สำหรับข้อความรายรับรายจ่าย

บทบาทของ Gemini ในระบบนี้:

- ตัดสินว่าข้อความเป็น transaction หรือไม่
- แปลงข้อความธรรมชาติเป็น field ที่ระบบเก็บได้จริง
- infer วันที่
- infer ประเภทรายการ
- map หมวดหมู่เท่าที่พอมั่นใจ

ระบบยังคงมี deterministic parser สำหรับ bank notification บางรูปแบบ เพื่อใช้กับกรณีที่ parse ได้แน่นอนโดยไม่ต้องพึ่งโมเดล

### 5. LINE integration layer

ระบบเชื่อมกับ LINE หลายระดับ:

- webhook รับ event จาก LINE
- profile lookup เพื่อสร้าง/อัปเดตผู้ใช้
- reply text / flex message
- rich menu assets และ script ที่เกี่ยวข้อง

พูดอีกแบบคือ LINE ไม่ได้เป็นแค่ notification channel แต่เป็น primary operating surface ของ product นี้

## Domain Model

entity หลักของระบบมีไม่เยอะ แต่ชัดเจน:

- `users`
  ใช้เก็บตัวตนของผู้ใช้, role, status และการเชื่อมกับ LINE

- `invite_codes`
  ใช้ควบคุม onboarding และ activation

- `local_auth_credentials`
  ใช้รองรับการ login แบบ username/password สำหรับบาง use case นอก LINE

- `categories`
  หมวดหมู่ของธุรกรรม แยกเป็น `expense`, `income`, หรือ `both`

- `transactions`
  หัวใจของระบบ เก็บจำนวนเงิน ประเภท วันที่ หมวดหมู่ note source และ source text

- `app_settings`
  ใช้เก็บค่าระดับระบบ เช่น Gemini model ปัจจุบัน

## Authentication And Access Model

ระบบมี auth หลัก 2 แบบ:

- LINE-based authentication
- local username/password authentication

หลัง login ระบบออก access token และรองรับการส่ง token ทั้งแบบ Bearer token และ cookie

authorization แบ่ง role เป็น:

- `user`
- `admin`
- `owner`

ตัวอย่างสิทธิ์:

- ผู้ใช้ทั่วไปเข้าถึง transaction ของตัวเอง
- admin/owner จัดการ invite code ได้
- owner ตั้งค่า Gemini model หรือจัดการ bootstrap/admin concern บางอย่างได้

## Notable Product Characteristics

- Mobile-first by nature เพราะ LINE คือช่องทางหลัก
- Conversational UX เป็นหัวใจของการใช้งาน
- AI-assisted input ลด friction ในการบันทึกรายการ
- Invite-only onboarding ช่วยควบคุมการเข้าถึง
- มี role-based admin capability ตั้งแต่ต้น
- รองรับทั้ง structured API usage และ conversational bot usage ในระบบเดียว

## What This Project Is Really Optimized For

ถ้ามองในเชิง product strategy โปรเจกต์นี้เหมาะกับการเป็น:

- personal finance assistant ที่ใช้งานผ่านแชต
- private/internal finance bot สำหรับกลุ่มปิด
- foundation สำหรับ hybrid product ที่มีทั้ง bot + web dashboard

จุดเด่นไม่ใช่แค่ “มี API บันทึกรายการ” แต่คือการทำให้การบันทึกรายรับรายจ่ายเกิดขึ้นได้ง่ายในช่องทางที่ผู้ใช้อยู่เป็นประจำอยู่แล้ว

## High-Level Technical Shape

- Runtime: Node.js + TypeScript
- Web server: Fastify
- Database: PostgreSQL
- ORM / schema layer: Drizzle ORM
- AI integration: Google Gemini
- Messaging platform: LINE Messaging API
- Documentation: Swagger / API reference

## Current Mental Model

ถ้าจะอธิบายโปรเจกต์นี้ให้คนใหม่ในทีมฟังแบบสั้นและแม่นที่สุด:

> Jod Tang คือระบบบันทึกรายรับรายจ่ายที่ใช้ LINE เป็น front door, ใช้ Gemini ช่วยแปลงข้อความธรรมชาติเป็น transaction, ใช้ Fastify เป็น application core, ใช้ PostgreSQL เป็นแหล่งเก็บข้อมูลหลัก, และเปิด REST API สำหรับการจัดการและต่อยอด product ในอนาคต
