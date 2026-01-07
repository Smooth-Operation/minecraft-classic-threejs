# minecraft-classic-threejs

A small web-based voxel building game inspired by **Minecraft Classic**.

You can:
- Join a world with friends (up to **8 players**)
- Walk/jump around
- **Place and break blocks**
- Come back later and see what people built (worlds are **persistent**)

Built for a hackathon, with a big focus on:
- **Mobile support** (playable on phones)
- **Fast “drop in and build” multiplayer**
- Keeping the stack simple and shippable

---

## What it is (and isn’t)

### ✅ Included
- Multiplayer worlds
- Block placing/breaking
- Simple movement
- A big set of blocks to build with
- Server list / join flow
- Persistent worlds

### ❌ Not included (for now)
- Crafting, survival, hunger
- Mobs, combat
- Redstone, fluids, complex mechanics

---

## Tech stack (high level)
- **Web client** (Three.js) hosted on **Vercel**
- **Supabase** for:
  - login/accounts
  - world list (server list)
  - saving the world so it persists
- A small **WebSocket server** on a VPS for real-time multiplayer

---

## How to try it (eventually)
- Open the site in your browser (desktop or mobile)
- Pick a world from the list
- Join and start building

---

## Project status
This is a hackathon build. Things may change quickly and break occasionally, but the goal is:
**fun building with friends as fast as possible.**

---

## Credits
Inspired by Minecraft Classic and classic voxel sandbox games.

