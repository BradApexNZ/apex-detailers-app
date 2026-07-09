# Ascend Macros

Ascend Macros is a private MVP tracker for Brad's Ascending plan: macros, saved meals, daily check-ins, black coffee control, gut tolerance, gym performance, GHK-Cu context and Sunday Reta context.

This app is original code. It is not a MacroFactor clone. The goal is to build a lightweight tracker with similar category-level ideas: macro logging, body-weight trend thinking, saved meals, and weekly adjustments.

## Current targets

- Calories: 3,100 kcal/day
- Protein: 180 g/day
- Carbs: 425 g/day
- Fat: 75 g/day
- Start weight: 85 kg
- Morning rule: water -> protein/carb food -> black coffee

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

- Weekly trend engine using average weight and average calories
- Custom food entry and barcode-style manual item database
- Recipe builder for the three oat flavours and gangster meals
- Graphs for weight, waist, calories, protein, coffee, appetite and digestion
- Bloodwork reminder module
- Export/import backup
- Public-safe peptide education module with regulatory review before release
