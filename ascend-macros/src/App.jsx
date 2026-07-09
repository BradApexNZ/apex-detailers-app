import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Apple, Coffee, Download, Dumbbell, Flame, Save, ShieldCheck, Syringe, TrendingUp, Utensils, Waves } from 'lucide-react';
import { firebaseReady, loadCloudState, saveCloudState } from './firebase.js';

const todayKey = () => new Date().toISOString().slice(0, 10);

const targets = {
  calories: 3100,
  protein: 180,
  carbs: 425,
  fat: 75,
  water: 2.5,
};

const defaultCheckIn = {
  date: todayKey(),
  weight: '85',
  waist: '',
  waterLitres: '',
  blackCoffee: '0',
  appetite: 'Normal',
  digestion: 'Good',
  nausea: false,
  reflux: false,
  constipation: false,
  diarrhoea: false,
  gym: 'Not logged',
  sleep: '',
  mood: '',
  restingHeartRate: '',
  ghkCuDone: false,
  retaSundayLogged: false,
  notes: '',
};

const meals = [
  {
    id: 'vanilla-oats',
    name: 'Vanilla Banana Custard Oats',
    time: 'Breakfast',
    day: 'Day 1',
    calories: 940,
    protein: 70,
    carbs: 135,
    fat: 18,
    vibe: 'Sweet/custardy morning anchor before black coffee.',
  },
  {
    id: 'teriyaki-bowl',
    name: 'Teriyaki Honey Soy Chicken Rice Bowl',
    time: 'Lunch',
    day: 'Day 1',
    calories: 820,
    protein: 55,
    carbs: 115,
    fat: 14,
    vibe: 'Gangster sauce allowed. Track roughly, do not make it dry chicken prison food.',
  },
  {
    id: 'half-gainer',
    name: 'Half Mass Gainer Rescue / Post-Gym',
    time: 'Snack',
    day: 'Any day',
    calories: 400,
    protein: 25,
    carbs: 65,
    fat: 5,
    vibe: 'Half serving first for gut tolerance. Use when calories are low or appetite is cooked.',
  },
  {
    id: 'beef-pasta',
    name: 'Lean Beef Tomato Pasta',
    time: 'Dinner',
    day: 'Day 1',
    calories: 920,
    protein: 58,
    carbs: 110,
    fat: 24,
    vibe: 'Proper tomato sauce, garlic, herbs, parmesan if wanted.',
  },
  {
    id: 'choc-oats',
    name: 'Choc Peanut Butter Brownie Oats',
    time: 'Breakfast',
    day: 'Day 2',
    calories: 980,
    protein: 72,
    carbs: 130,
    fat: 23,
    vibe: 'Dessert oats. Still hits the morning macro anchor.',
  },
  {
    id: 'wraps',
    name: 'Chicken/Turkey Wraps with Yoghurt Garlic Sauce',
    time: 'Lunch',
    day: 'Day 2',
    calories: 850,
    protein: 60,
    carbs: 105,
    fat: 18,
    vibe: 'Sweet chilli, BBQ, yoghurt garlic, salsa — make it taste good.',
  },
  {
    id: 'sushi-bowl',
    name: 'Bang Bang Chicken Sushi Bowl',
    time: 'Dinner',
    day: 'Day 2',
    calories: 920,
    protein: 62,
    carbs: 125,
    fat: 18,
    vibe: 'Sushi rice, sugar snap peas, soy, bang bang/kewpie measured but not feared.',
  },
  {
    id: 'rasp-oats',
    name: 'White Choc Raspberry Cheesecake Oats',
    time: 'Breakfast',
    day: 'Day 3',
    calories: 910,
    protein: 66,
    carbs: 128,
    fat: 17,
    vibe: 'Sweet, fruity, cheesecake-style without gut-bombing the morning.',
  },
  {
    id: 'mince-potato',
    name: 'Lean Mince Potato Bowl',
    time: 'Lunch',
    day: 'Day 3',
    calories: 900,
    protein: 58,
    carbs: 110,
    fat: 22,
    vibe: 'Savoury tomatoes, cheese, light sour cream, paprika. Comfort meal, not bland.',
  },
  {
    id: 'diy-gainer',
    name: 'DIY Protein Gainer Smoothie',
    time: 'Snack',
    day: 'Day 3',
    calories: 600,
    protein: 45,
    carbs: 90,
    fat: 9,
    vibe: 'Milk, whey, banana, oats, honey. Easier than chewing when appetite dips.',
  },
  {
    id: 'satay-udon',
    name: 'Satay Chicken Udon',
    time: 'Dinner',
    day: 'Day 3',
    calories: 850,
    protein: 58,
    carbs: 105,
    fat: 19,
    vibe: 'Lee Kum Kee satay, broccolini, capsicum, sugar snap peas. Big flavour, measured sauce.',
  },
];

function progress(value, target) {
  const pct = Math.min(100, Math.round((Number(value || 0) / target) * 100));
  return pct;
}

function MacroCard({ label, value, target, unit }) {
  const pct = progress(value, target);
  return (
    <div className="card macro-card">
      <div className="macro-top">
        <span>{label}</span>
        <strong>{Math.round(value || 0)} / {target}{unit}</strong>
      </div>
      <div className="bar"><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function App() {
  const [loggedMeals, setLoggedMeals] = useState(() => JSON.parse(localStorage.getItem('ascend:meals') || '[]'));
  const [checkIn, setCheckIn] = useState(() => JSON.parse(localStorage.getItem('ascend:checkin') || JSON.stringify(defaultCheckIn)));
  const [syncStatus, setSyncStatus] = useState(firebaseReady ? 'Firebase ready' : 'Local mode');

  useEffect(() => {
    localStorage.setItem('ascend:meals', JSON.stringify(loggedMeals));
    localStorage.setItem('ascend:checkin', JSON.stringify(checkIn));
  }, [loggedMeals, checkIn]);

  const totals = useMemo(() => loggedMeals.reduce((sum, meal) => ({
    calories: sum.calories + meal.calories,
    protein: sum.protein + meal.protein,
    carbs: sum.carbs + meal.carbs,
    fat: sum.fat + meal.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [loggedMeals]);

  const sunday = new Date().getDay() === 0;
  const monday = new Date().getDay() === 1;

  function addMeal(meal) {
    setLoggedMeals((current) => [...current, { ...meal, loggedAt: new Date().toISOString() }]);
  }

  function clearToday() {
    setLoggedMeals([]);
    setCheckIn({ ...defaultCheckIn, date: todayKey() });
  }

  async function cloudSave() {
    if (!firebaseReady) {
      setSyncStatus('Local mode only — add Firebase env vars to enable cloud sync.');
      return;
    }
    try {
      await saveCloudState({ loggedMeals, checkIn, targets });
      setSyncStatus('Saved to Firebase');
    } catch (error) {
      setSyncStatus(`Firebase save failed: ${error.message}`);
    }
  }

  async function cloudLoad() {
    if (!firebaseReady) {
      setSyncStatus('Local mode only — add Firebase env vars to enable cloud sync.');
      return;
    }
    try {
      const data = await loadCloudState();
      if (data?.loggedMeals) setLoggedMeals(data.loggedMeals);
      if (data?.checkIn) setCheckIn(data.checkIn);
      setSyncStatus(data ? 'Loaded from Firebase' : 'No cloud data yet');
    } catch (error) {
      setSyncStatus(`Firebase load failed: ${error.message}`);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ date: todayKey(), targets, totals, loggedMeals, checkIn }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ascending-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">ASCENDING MVP</p>
          <h1>Ascend Macros</h1>
          <p className="hero-copy">Clean bulk/recomp tracker for macros, meals, coffee, gut tolerance, gym, GHK-Cu context and Sunday Reta check-ins. No dosing advice. Data-first, not vibes.</p>
        </div>
        <div className="target-pill"><TrendingUp size={18}/> 85kg start · 3,100 kcal</div>
      </header>

      {(sunday || monday) && (
        <section className="warning-card">
          <Waves />
          <div><strong>{sunday ? 'Sunday Reta context' : 'Monday gut window'}</strong><p>Bias easier foods today: oats, smoothies, rice, chicken, yoghurt, bananas, electrolytes. Avoid greasy hero meals and naked black coffee.</p></div>
        </section>
      )}

      <section className="grid dashboard">
        <MacroCard label="Calories" value={totals.calories} target={targets.calories} unit="" />
        <MacroCard label="Protein" value={totals.protein} target={targets.protein} unit="g" />
        <MacroCard label="Carbs" value={totals.carbs} target={targets.carbs} unit="g" />
        <MacroCard label="Fat" value={totals.fat} target={targets.fat} unit="g" />
      </section>

      <section className="card morning-rule">
        <Coffee />
        <div>
          <h2>Morning rule</h2>
          <p><strong>Water → food/protein → black coffee.</strong> No empty-stomach black coffee. Aim for one caffeinated black coffee, then decaf if you want the ritual.</p>
        </div>
      </section>

      <section className="section-head"><Utensils/><h2>Quick-add Ascending meals</h2></section>
      <section className="meal-grid">
        {meals.map((meal) => (
          <article className="card meal-card" key={meal.id}>
            <p className="tag">{meal.day} · {meal.time}</p>
            <h3>{meal.name}</h3>
            <p>{meal.vibe}</p>
            <div className="mini-macros"><span>{meal.calories} kcal</span><span>{meal.protein}P</span><span>{meal.carbs}C</span><span>{meal.fat}F</span></div>
            <button onClick={() => addMeal(meal)}>Add meal</button>
          </article>
        ))}
      </section>

      <section className="grid two-col">
        <section className="card">
          <div className="section-head inline"><Activity/><h2>Daily check-in</h2></div>
          <div className="form-grid">
            <label>Weight kg<input value={checkIn.weight} onChange={(e) => setCheckIn({ ...checkIn, weight: e.target.value })}/></label>
            <label>Waist cm<input value={checkIn.waist} onChange={(e) => setCheckIn({ ...checkIn, waist: e.target.value })}/></label>
            <label>Water litres<input value={checkIn.waterLitres} onChange={(e) => setCheckIn({ ...checkIn, waterLitres: e.target.value })}/></label>
            <label>Black coffees<input value={checkIn.blackCoffee} onChange={(e) => setCheckIn({ ...checkIn, blackCoffee: e.target.value })}/></label>
            <label>Appetite<select value={checkIn.appetite} onChange={(e) => setCheckIn({ ...checkIn, appetite: e.target.value })}><option>Low</option><option>Normal</option><option>High</option><option>Cooked</option></select></label>
            <label>Digestion<select value={checkIn.digestion} onChange={(e) => setCheckIn({ ...checkIn, digestion: e.target.value })}><option>Good</option><option>Slow</option><option>Rough</option><option>Constipated</option><option>Loose</option></select></label>
            <label>Gym<input value={checkIn.gym} onChange={(e) => setCheckIn({ ...checkIn, gym: e.target.value })}/></label>
            <label>Sleep<input value={checkIn.sleep} onChange={(e) => setCheckIn({ ...checkIn, sleep: e.target.value })}/></label>
            <label>Mood<input value={checkIn.mood} onChange={(e) => setCheckIn({ ...checkIn, mood: e.target.value })}/></label>
            <label>Resting HR<input value={checkIn.restingHeartRate} onChange={(e) => setCheckIn({ ...checkIn, restingHeartRate: e.target.value })}/></label>
          </div>
          <div className="checkbox-row">
            {['nausea','reflux','constipation','diarrhoea'].map((field) => <label key={field}><input type="checkbox" checked={checkIn[field]} onChange={(e) => setCheckIn({ ...checkIn, [field]: e.target.checked })}/>{field}</label>)}
          </div>
          <textarea placeholder="Notes: side effects, food issues, training, anything to tell Future You." value={checkIn.notes} onChange={(e) => setCheckIn({ ...checkIn, notes: e.target.value })}/>
        </section>

        <section className="card">
          <div className="section-head inline"><Syringe/><h2>Routine context</h2></div>
          <p className="soft">Track completion and symptoms only. This app does not recommend peptides, sources, or dosing.</p>
          <label className="big-check"><input type="checkbox" checked={checkIn.ghkCuDone} onChange={(e) => setCheckIn({ ...checkIn, ghkCuDone: e.target.checked })}/> GHK-Cu daily logged</label>
          <label className="big-check"><input type="checkbox" checked={checkIn.retaSundayLogged} onChange={(e) => setCheckIn({ ...checkIn, retaSundayLogged: e.target.checked })}/> Sunday Reta context logged</label>
          <div className="guardrail"><ShieldCheck/><p><strong>Guardrails:</strong> Protein first. Carbs for training. Moderate fat. Sauces allowed. Hydrate/electrolytes. Bloodwork after 3 months. Adjust from weekly data.</p></div>
          <div className="danger"><AlertTriangle/><p><strong>Red flags:</strong> severe ongoing stomach pain, repeated vomiting, dehydration, fainting, chest pain, trouble breathing, yellow skin/eyes, or strong right-upper-abdominal pain.</p></div>
        </section>
      </section>

      <section className="actions">
        <button onClick={cloudSave}><Save/> Save cloud</button>
        <button onClick={cloudLoad}><Download/> Load cloud</button>
        <button onClick={exportJson}><Download/> Export JSON</button>
        <button className="ghost" onClick={clearToday}>Clear today</button>
      </section>
      <p className="sync-status">{syncStatus}</p>
    </main>
  );
}

export default App;
