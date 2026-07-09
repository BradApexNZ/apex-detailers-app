# Ascend Macros

Ascend Macros is a private MVP tracker for Brad's Ascending plan: macros, saved meals, daily check-ins, black coffee control, gut tolerance, gym performance, GHK-Cu context and Sunday Reta context.

This app is original code. It is not a MacroFactor clone. The goal is to build a lightweight tracker with similar category-level ideas: macro logging, body-weight trend thinking, saved meals, and weekly adjustments.

## Preloaded profile

- Name: Brad
- Age: 25
- Height: 6 ft 2-3
- Start/current weight: 85 kg
- Goal: clean lean bulk / recomp
- Strategy: use Reta to reduce junk-food noise, then force structured high-protein, high-carb, moderate-fat meals that support gym and gut tolerance.

## Current targets

- Calories: 3,100 kcal/day
- Protein: 180 g/day
- Carbs: 425 g/day
- Fat: 75 g/day
- Lean-bulk pace target: about 0.2-0.4 kg/week
- Morning rule: water -> protein/carb food -> black coffee

## Adaptive macro coach

The MVP now includes a simple self-adjusting macro engine. It starts with Brad's preloaded targets and then looks at saved daily trend entries.

It uses:

- Body weight trend
- Average logged calories
- Average logged protein
- Waist change if entered
- Gut symptoms: nausea, reflux, constipation, diarrhoea
- Current target gain range

Rules in plain English:

- If fewer than 3 days are saved, the app stays in learning mode.
- If protein consistency is low, it tells the user to fix protein first.
- If gut symptoms are high, it holds calories and recommends easier, lower-grease foods.
- If weight trend is below target and calories are actually being hit, it suggests adding about 200 kcal/day.
- If weight or waist climbs too fast, it suggests pulling back about 150 kcal/day.
- Suggested calorie changes recalculate carbs while holding protein and fat steady.

This is a practical coaching engine, not medical advice.

## Safety boundary

This app does **not** provide peptide sourcing, dosing, or treatment advice. It only tracks user-entered routine context, symptoms, nutrition, hydration, training, and notes.

## Run locally

```bash
cd ascend-macros
npm install
npm run dev
```

## Firebase setup

The app works in local browser storage without Firebase config. To enable cloud save/load:

1. Create a Firebase project.
2. Add a Web app in Firebase.
3. Enable Authentication -> Anonymous sign-in.
4. Create Cloud Firestore.
5. Copy `.env.example` to `.env.local` and paste your Firebase web config values.
6. Install Firebase CLI and log in.
7. Deploy:

```bash
npm run build
firebase deploy --only hosting,firestore:rules
```

## Planned next features

- Proper custom food entry
- Recipe builder for the three oat flavours and gangster meals
- Graphs for weight, waist, calories, protein, coffee, appetite and digestion
- Bloodwork reminder module
- Export/import backup
- Public-safe peptide education module with regulatory review before release
