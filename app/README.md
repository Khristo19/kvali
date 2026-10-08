# App (Expo / React Native)

**Decided 7 Oct 2026:** one React Native codebase with **Expo**, running on **web, Android and iOS**.
- **Scope for 12 Oct:** a demo app showing a full job (farmer, operator, validators, payout, challenge). It runs in **simulated mode** first, using the same tested logic as `services/proof`, then switches to the real devnet program (tracker tasks w01–w10).
- **Wallets:** an **embedded wallet for farmers** (email or Google sign-in, no seed phrase; Privy Expo SDK, Para as fallback) **plus Phantom** for operators, validators and crypto-native users.
- The earlier Angular plan below is kept for reference; its screen list still applies.

## Running the app (set up in w01, 8 Oct 2026)

Expo SDK 57, React Native 0.86, expo-router 57, React 19.2, TypeScript 6. Node 22 (`source ~/.nvm/nvm.sh`).

```bash
cd app
npm install
npm run web                          # browser (http://localhost:8081)
npm run android                      # Expo Go / emulator on Android
npm run ios                          # Expo Go on iPhone (or simulator on macOS)
npm run typecheck                    # tsc --noEmit
npx expo export --platform web       # static site in app/dist
```

- **Layout:** routes in `src/app/` (Home, `farmer`, `operator`, `validator`, `how-it-works`); theme in `src/theme.ts`; public config in `src/config.ts`.
- **Shared logic:** `import { computeSettlement } from "@kvali/proof/settlement"` resolves to `../services/proof/src/settlement.ts` (no copy). Wired in `metro.config.js` (watchFolders + resolver) and `tsconfig.json` (`paths`). Same for `verdict` and `calibration`.
- **Env:** `app/.env` is a symlink to the repo-root `.env`. Only `EXPO_PUBLIC_*` values are inlined into the bundle; never put secrets there.
- **Simulated mode** first; Privy (w08) and the devnet program come later.

---

# Web app (Angular)

Not scaffolded yet. To start:

```bash
npx @angular/cli@latest new kvali-app --directory . --style=scss --ssr=false
npm i leaflet @turf/turf @coral-xyz/anchor @solana/web3.js @solana/spl-token
npm i -D @types/leaflet
# then add PWA support
npx ng add @angular/pwa
```

Wallet: embedded / social login (Privy or Para). Farmers should never see "install Phantom". Check both SDKs' Angular support; if neither has one, wrap their JS SDK in a service.

## Screens

**Farmer**
1. Sign in (phone or Google)
2. My fields: draw polygon on satellite map (Leaflet + turf.js area) → saved GeoJSON, SHA-256 = `field_hash`
3. Post job: field, crop, chemical, target L/ha, date window, price → `post_job`
4. Job status timeline
5. Proof record: liters/ha vs band, coverage %, track map, weather, manifest link. Pays out automatically after 24h. Optional **Challenge** (`challenge`, locks 20% + evidence photos)

**Operator**
1. Sign in, register (`register_operator`), upload certification
2. Open jobs near me (map + list, from the indexer)
3. Accept with bond → `accept_job`
4. Upload flight record export (+ tank weights) → proof service
5. Earnings and reputation (jobs_completed / jobs_failed)

## Status and challenge by link (Solana Actions / Blinks)

Farmers shouldn't need to open an app. After the proof is submitted, the farmer gets a WhatsApp or SMS link. It opens a small page (a Solana Action) showing liters/ha against the target, coverage %, the track map, the weather record and a countdown: "Pays the operator automatically in 23 h." Doing nothing is the normal case. One button, **Challenge (locks 20%: $60)**, with a photo upload for evidence (`challenge`). The transaction is signed by the farmer's embedded wallet. Serve the Action from the proof service (`GET` returns the card, `POST` returns the transaction to sign). Check current Actions/Blinks spec and wallet support before building.
