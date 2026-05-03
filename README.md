# Society HomeChef — Hyperlocal Home-Cooked Food Platform

> A multi-agent MVP for gated communities: home chefs publish dishes with AI-estimated nutrition, residents order in one tap, and nearby riders deliver within 2 km.

![Stack](https://img.shields.io/badge/React_19-TanStack_Start-blue)
![DB](https://img.shields.io/badge/Supabase-PostgreSQL_+_Auth_+_Realtime-green)
![AI](https://img.shields.io/badge/AI-Heuristic_+_Gemini_Flash-orange)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Tech Stack & Justifications](#tech-stack--justifications)
- [Data Model](#data-model)
- [Agent Roles & Flows](#agent-roles--flows)
- [AI Nutrition Pipeline](#ai-nutrition-pipeline)
- [Real-time & Rider Matching](#real-time--rider-matching)
- [Security (RLS)](#security-rls)
- [What Was Cut & Assumptions](#what-was-cut--assumptions)
- [Scalability Considerations](#scalability-considerations)
- [Setup Instructions](#setup-instructions)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React 19)                  │
│  TanStack Start + TanStack Router (file-based routing)  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  /chef   │  │   /feed      │  │     /rider       │  │
│  │Dashboard │  │ Resident Feed│  │   Rider Hub      │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬─────────┘  │
│       │               │                   │             │
│  ┌────┴───────────────┴───────────────────┴──────────┐  │
│  │         lib/nutrition.ts (Heuristic Engine)       │  │
│  │         lib/matching.ts  (Rider Matching)         │  │
│  │         lib/distance.ts  (Haversine)              │  │
│  └───────────────────┬───────────────────────────────┘  │
│                      │                                  │
│  ┌───────────────────┴───────────────────────────────┐  │
│  │  server/ai-nutrition.functions.ts (Server Fn)     │  │
│  │  → Lovable AI Gateway → Gemini 2.5 Flash          │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ Supabase JS Client
┌──────────────────────────┴──────────────────────────────┐
│                   Supabase (BaaS)                       │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────────┐ │
│  │   Auth   │  │ Realtime  │  │  Storage (Images)    │ │
│  └──────────┘  └───────────┘  └──────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐   │
│  │  PostgreSQL: profiles, dishes, orders,           │   │
│  │              rider_status  (RLS-protected)       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

The architecture follows a **serverless-first** pattern. The frontend handles routing and UI, business logic lives in shared `lib/` modules, and the only server-side code is the AI nutrition function (to protect the API key). Supabase handles auth, database, realtime subscriptions, file storage, and row-level security — eliminating the need for a custom backend.

---

## Tech Stack & Justifications

| Technology | Role | Why This Choice |
|---|---|---|
| **React 19 + TanStack Start** | Frontend framework | TanStack Start provides file-based routing, server functions, and SSR out of the box. Faster setup than Next.js for a Vite-based project with Cloudflare deployment support. |
| **Supabase** | Auth, DB, Realtime, Storage | Single platform for all backend needs. Auth with email/password in minutes. PostgreSQL with RLS removes the need for middleware. Realtime subscriptions over WebSocket for live order tracking. Storage for dish images with CDN. |
| **TailwindCSS v4** | Styling | Utility-first CSS with OKLCH color tokens. Rapid iteration on UI without context-switching to stylesheets. |
| **Shadcn/UI (Radix)** | Component library | Accessible, unstyled primitives. Consistent UI without design overhead. |
| **TypeScript** | Type safety | Supabase generates types from the schema. Catches data-shape bugs at compile time instead of runtime. |
| **Haversine (custom)** | Distance calculation | No external dependency needed for sub-2 km society-level distances. Equirectangular approximation would also work but Haversine is only 17 lines. |
| **Gemini 2.5 Flash** | AI nutrition fallback | Fast, cheap, good at structured JSON output. Only invoked when the heuristic engine has low confidence. |

---

## Data Model

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   profiles   │       │    dishes    │       │    orders    │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK, FK→  │◄──────│ chef_id (FK) │   ┌──►│ id (PK)      │
│   auth.users)│       │ id (PK)      │   │   │ dish_id (FK) │
│ full_name    │       │ society      │   │   │ resident_id  │
│ role (enum)  │       │ name         │   │   │ chef_id (FK) │
│ society      │       │ description  │   │   │ rider_id (FK)│
│ flat_number  │       │ price        │   │   │ society      │
│ latitude     │       │ quantity     │   │   │ status (enum)│
│ longitude    │       │ image_url    │   │   │ price        │
│ bio          │       │ calories     │   │   │ created_at   │
│ created_at   │       │ health_score │   │   │ updated_at   │
└──────┬───────┘       │ tags[]       │   │   └──────────────┘
       │               │ ai_explain.  │   │
       │               │ meal_slot    │   │   ┌──────────────┐
       │               │ status (enum)│   │   │ rider_status │
       │               │ created_at   │   │   ├──────────────┤
       │               └──────────────┘   │   │ rider_id(PK) │
       │                                  │   │ available    │
       └──────────────────────────────────┘   │ updated_at   │
                                              └──────────────┘
```

**Design decisions:**
- **Flat schema** — no joins needed for the critical read path (feed listing). Dishes embed `society` for fast filtering.
- **Enums over strings** — `app_role`, `dish_status`, `order_status`, `meal_slot` are PostgreSQL enums. Prevents typos and invalid state at the DB level.
- **Nullable `rider_id`** — orders start without a rider. Matching is attempted at order time but may fail if no riders are online. Riders can also self-assign from the open job queue.
- **Coordinate storage** — latitude/longitude on profiles enables Haversine distance matching. Mock coordinates jittered around Bangalore center for the demo.

---

## Agent Roles & Flows

### 🍳 Chef Flow
1. Chef signs up → auto-profile created via DB trigger
2. Navigates to `/chef` (protected by `RequireRole` guard)
3. Clicks "New dish" → fills form (name, description, price, qty, meal slot, photo)
4. **Live heuristic preview** shows calories + health score as they type
5. Optionally clicks "Refine with AI" for Gemini-powered estimate
6. Publishes → dish stored with nutrition metadata
7. Can mark dishes "sold out" or delete them
8. Stats cards show active listings, active orders, revenue from delivered orders
9. Real-time subscription updates dashboard when orders come in

### 🛒 Resident Flow
1. Resident signs up → auto-profile created
2. Navigates to `/feed`
3. Sees all available dishes in their society (RLS-scoped)
4. Can search by name and filter by tags (Veg, High Protein, Low Calorie, Keto)
5. Each dish card shows: image, chef name + flat, price, calories, health score, tags
6. Clicks "Order" → system finds nearest available rider via matching algorithm
7. Order created with auto-assigned rider (or null if none available)
8. Active orders shown in a strip at the top with live status updates

### 🏍️ Rider Flow
1. Rider signs up → auto-profile created
2. Navigates to `/rider`
3. Toggles availability switch (online/offline)
4. When online: sees open jobs (unassigned in their society) + their assigned jobs
5. Can **Accept** an unassigned job → assigns themselves
6. Status progression: `placed → accepted → picked_up → delivered`
7. Each job card shows: dish name, chef location, resident location, price, time
8. Delivered orders shown in a separate history section

---

## AI Nutrition Pipeline

> See also: [AI_INTEGRATION.md](./AI_INTEGRATION.md) for the detailed pipeline documentation.

**Architecture: Two-stage hybrid pipeline**

```
Dish Name + Description
        │
        ▼
┌─────────────────────────┐
│  Stage 1: Heuristic     │  ← Always runs, ~0ms
│  Engine (15 regex rules) │
│  ─────────────────────  │
│  • Scan for keywords    │
│  • Accumulate kcal      │
│  • Adjust health score  │
│  • Derive tags          │
│  • Compute confidence   │
└──────────┬──────────────┘
           │
     confidence?
      ╱         ╲
  medium/high    low
      │           │
      ▼           ▼
   Return    ┌─────────────┐
   result    │  Stage 2:   │  ← Only if needed
             │  AI (Gemini) │
             │  via server  │
             │  function    │
             └──────┬──────┘
                    │
                 Merge with
                 heuristic tags
                    │
                    ▼
               Return enriched
               result
```

**Why hybrid?**
- Heuristic is **instant, deterministic, and explainable** — perfect for a demo
- AI is **expensive, slow, and opaque** — only use it when the heuristic can't confidently classify
- This mirrors production systems where you use cheap heuristics for 80% of cases and ML for the long tail

---

## Real-time & Rider Matching

### Realtime
All three dashboards subscribe to Supabase Realtime (PostgreSQL logical replication):
- **Chef**: listens for `orders` and `dishes` changes → auto-refreshes stats
- **Resident**: listens for `dishes` and `orders` changes → live feed + order status
- **Rider**: listens for `orders` changes → new jobs appear instantly

### Rider Matching Algorithm
```
findNearestRider(residentSociety, residentLocation):
  1. Query rider_status WHERE available = true
  2. Query profiles WHERE id IN (online_rider_ids)
       AND society = residentSociety AND role = 'rider'
  3. For each rider:
       distance = haversine(residentLocation, riderLocation)
       if distance <= 2km AND distance < bestDistance:
         bestRider = rider
  4. Return bestRider or null
```

**Trade-offs:**
- Simple linear scan, not spatially indexed — fine for a society with <50 riders
- At scale: replace with PostGIS `ST_DWithin` for O(log n) spatial queries

---

## Security (RLS)

Every table has Row Level Security enabled. Key policies:

| Table | Policy | Logic |
|---|---|---|
| `profiles` | Read | Same society OR own profile |
| `profiles` | Insert | Only own profile (`id = auth.uid()`) |
| `dishes` | Read | Same society |
| `dishes` | Insert | Own dishes + must be a chef |
| `dishes` | Update/Delete | Only own dishes |
| `orders` | Read | Participant (resident, chef, or rider) OR rider viewing open jobs in their society |
| `orders` | Insert | Only residents can place orders |
| `orders` | Update | Any participant can update (for status changes) |
| `rider_status` | Read | Same society |
| `rider_status` | Write | Only own status |

Helper functions `current_user_society()` and `current_user_role()` run as `SECURITY DEFINER` to prevent the user from spoofing their society or role.

---

## What Was Cut & Assumptions

### Cut Due to Time Constraints
- **Push notifications** — riders don't get notified of new jobs; they must poll/stay on the dashboard
- **Order cancellation flow** — no cancel button for residents after ordering
- **Chef rating system** — no reviews or reputation scoring
- **Payment integration** — all orders are implicitly cash-on-delivery
- **Admin dashboard** — no moderation or analytics view
- **Image-based nutrition** — the AI pipeline uses text only; image analysis (GPT-4V / Gemini Vision) was scoped but not implemented
- **Multi-society support** — society is a text field; no society admin or discovery

### Assumptions
- **Single society per user** — users belong to one society and only see content from it
- **Email verification disabled** — for demo purposes, signups are instant (no email confirmation)
- **Mock coordinates** — latitude/longitude are jittered around Bangalore center (12.97°N, 77.59°E) during signup. In production, use browser Geolocation API
- **Serving size = 1** — all calorie estimates are per single serving
- **INR currency** — all prices are in Indian Rupees (₹)

---

## Scalability Considerations

If this system had to handle 500 concurrent users:

| Bottleneck | Current State | Improvement |
|---|---|---|
| **Rider matching** | Linear scan over all online riders | Use PostGIS `ST_DWithin(geog, geog, 2000)` for spatial indexing |
| **Dish quantity** | Client-side decrement (`qty - 1`) | Atomic SQL: `UPDATE dishes SET quantity = quantity - 1 WHERE quantity > 0 RETURNING quantity` |
| **Realtime subscriptions** | All users subscribe to full table changes | Filter by society using Supabase Realtime filters or partition channels |
| **AI nutrition calls** | Synchronous, blocking | Queue via a background job (e.g., Supabase Edge Functions + pg_cron) |
| **Database connections** | Supabase pooler handles this | At true scale, use connection pooling (PgBouncer) with read replicas |

---

## Setup Instructions

### Prerequisites
- Node.js 18+ (or Bun)
- A Supabase project ([supabase.com](https://supabase.com))

### 1. Clone & Install
```bash
git clone https://github.com/<your-username>/fastlane-genesis.git
cd fastlane-genesis
npm install
```

### 2. Environment Variables
Copy the example env file and fill in your Supabase credentials:
```bash
cp .env.example .env
```

Required variables:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

### 3. Database Setup
Run the migrations in your Supabase SQL editor (in order):
1. `supabase/migrations/20260429173144_*.sql` — Creates all tables, enums, RLS, triggers, and storage bucket
2. `supabase/migrations/20260429173211_*.sql` — Revokes public access to helper functions
3. `supabase/migrations/20260429173246_*.sql` — Sets storage bucket to private
4. `supabase/migrations/20260429173309_*.sql` — Sets storage bucket to public (final state)

Or use the Supabase CLI:
```bash
npx supabase db push
```

### 4. Run Locally
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

### 5. Demo Flow
1. **Sign up** as a Chef → go to `/chef` → publish a dish
2. **Sign up** as a Rider (different browser/incognito) → go to `/rider` → toggle online
3. **Sign up** as a Resident (another incognito) → go to `/feed` → place an order
4. Watch the rider dashboard update in real-time → accept → pick up → deliver

---

## License

MIT
# fastlane_genesis
