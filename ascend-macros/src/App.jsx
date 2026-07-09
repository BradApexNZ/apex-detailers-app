import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CalendarDays, Coffee, Download, Save, Settings, ShieldCheck, SlidersHorizontal, Syringe, TrendingUp, Utensils, Waves } from 'lucide-react';
import { firebaseReady, loadCloudState, saveCloudState } from './firebase.js';

const todayKey = () => new Date().toISOString().slice(0, 10);
const toNumber = (value, fallback = 0) => Number.parseFloat(value) || fallback;

const defaultProfile = {
  name: 'Brad',
  age: '25',
  height: '6 ft 2-3',
  startWeight: '85',
  currentWeight: '85',
  goal: 'Clean lean bulk / recomp',
  strategy: 'Use Reta to reduce junk-food noise, then force structured high-protein, high-carb, moderate-fat meals that support gym and gut tolerance.',
  calories: '3100',
  protein: '180',
  carbs: '425',
  fat: '75',
  water: '2.5',
  weeklyGainMin: '0.2',
  weeklyGainMax: '0.4',
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
  { id: 'vanilla-oats', name: 'Vanilla Banana Custard Oats', time: 'Breakfast', day: 'Day 1', calories: 940, protein: 70, carbs: 135, fat: 18, vibe: 'Sweet/custardy morning anchor before black coffee.' },
  { id: 'teriyaki-bowl', name: 'Teriyaki Honey Soy Chicken Rice Bowl', time: 'Lunch', day: 'Day 1', calories: 820, protein: 55, carbs: 115, fat: 14, vibe: 'Gangster sauce allowed. Track roughly, do not make it dry chicken prison food.' },
  { id: 'half-gainer', name: 'Half Mass Gainer Rescue / Post-Gym', time: 'Snack', day: 'Any day', calories: 400, protein: 25, carbs: 65, fat: 5, vibe: 'Half serving first for gut tolerance. Use when calories are low or appetite is cooked.' },
  { id: 'beef-pasta', name: 'Lean Beef Tomato Pasta', time: 'Dinner', day: 'Day 1', calories: 920, protein: 58, carbs: 110, fat: 24, vibe: 'Proper tomato sauce, garlic, herbs, parmesan if wanted.' },
  { id: 'choc-oats', name: 'Choc Peanut Butter Brownie Oats', time: 'Breakfast', day: 'Day 2', calories: 980, protein: 72, carbs: 130, fat: 23, vibe: 'Dessert oats. Still hits the morning macro anchor.' },
  { id: 'wraps', name: 'Chicken/Turkey Wraps with Yoghurt Garlic Sauce', time: 'Lunch', day: 'Day 2', calories: 850, protein: 60, carbs: 105, fat: 18, vibe: 'Sweet chilli, BBQ, yoghurt garlic, salsa — make it taste good.' },
  { id: 'sushi-bowl', name: 'Bang Bang Chicken Sushi Bowl', time: 'Dinner', day: 'Day 2', calories: 920, protein: 62, carbs: 125, fat: 18, vibe: 'Sushi rice, sugar snap peas, soy, bang bang/kewpie measured but not feared.' },
  { id: 'rasp-oats', name: 'White Choc Raspberry Cheesecake Oats', time: 'Breakfast', day: 'Day 3', calories: 910, protein: 66, carbs: 128, fat: 17, vibe: 'Sweet, fruity, cheesecake-style without gut-bombing the morning.' },
  { id: 'mince-potato', name: 'Lean Mince Potato Bowl', time: 'Lunch', day: 'Day 3', calories: 900, protein: 58, carbs: 110, fat: 22, vibe: 'Savoury tomatoes, cheese, light sour cream, paprika. Comfort meal, not bland.' },
  { id: 'diy-gainer', name: 'DIY Protein Gainer Smoothie', time: 'Snack', day: 'Day 3', calories: 600, protein: 45, carbs: 90, fat: 9, vibe: 'Milk, whey, banana, oats, honey. Easier than chewing when appetite dips.' },
  { id: 'satay-udon', name: 'Satay Chicken Udon', time: 'Dinner', day: 'Day 3', calories: 850, protein: 58, carbs: 105, fat: 19, vibe: 'Lee Kum Kee satay, broccolini, capsicum, sugar snap peas. Big flavour, measured sauce.' },
];

function buildTargets(profile) {
  return {
    calories: Math.round(toNumber(profile.calories, 3100)),
    protein: Math.round(toNumber(profile.protein, 180)),
    carbs: Math.round(toNumber(profile.carbs, 425)),
    fat: Math.round(toNumber(profile.fat, 75)),
    water: toNumber(profile.water, 2.5),
  };
}

function progress(value, target) {
  return Math.min(100, Math.round((Number(value || 0) / target) * 100));
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

function buildAdaptiveCoach({ history, checkIn, totals, targets, profile }) {
  const upserted = [...history.filter((entry) => entry.date !== todayKey()), {
    date: todayKey(),
    totals,
    checkIn,
    targets,
  }].filter((entry) => entry?.checkIn?.weight);

  const recent = upserted
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-7);

  if (recent.length < 3) {
    return {
      status: 'Learning mode',
      message: 'Save at least 3 daily check-ins before the app starts adjusting. Your preloaded Ascending targets stay active for now.',
      suggested: targets,
      stats: { days: recent.length, avgCalories: 0, avgProtein: 0, weeklyWeightChange: 0, waistChange: 0 },
    };
  }

  const first = recent[0];
  const last = recent[recent.length - 1];
  const daySpan = Math.max(1, (new Date(last.date) - new Date(first.date)) / 86400000);
  const firstWeight = toNumber(first.checkIn.weight, toNumber(profile.currentWeight, 85));
  const lastWeight = toNumber(last.checkIn.weight, firstWeight);
  const weeklyWeightChange = ((lastWeight - firstWeight) / daySpan) * 7;
  const firstWaist = toNumber(first.checkIn.waist, 0);
  const lastWaist = toNumber(last.checkIn.waist, 0);
  const waistChange = firstWaist && lastWaist ? lastWaist - firstWaist : 0;
  const avgCalories = recent.reduce((sum, entry) => sum + toNumber(entry.totals?.calories, 0), 0) / recent.length;
  const avgProtein = recent.reduce((sum, entry) => sum + toNumber(entry.totals?.protein, 0), 0) / recent.length;
  const symptomCount = recent.reduce((sum, entry) => {
    const c = entry.checkIn || {};
    return sum + ['nausea', 'reflux', 'constipation', 'diarrhoea'].filter((key) => c[key]).length;
  }, 0);

  const minGain = toNumber(profile.weeklyGainMin, 0.2);
  const maxGain = toNumber(profile.weeklyGainMax, 0.4);
  let calorieChange = 0;
  let status = 'Hold steady';
  let message = 'Your current targets look okay. Keep logging and let the trend build.';

  if (avgProtein < targets.protein * 0.9) {
    status = 'Protein first';
    message = `Average protein is about ${Math.round(avgProtein)}g/day, below target. Fix protein consistency before judging calories.`;
  } else if (symptomCount >= 4) {
    status = 'Gut guardrail';
    message = 'Gut symptoms are popping up. Hold calories, keep foods softer/easier, reduce greasy fats, and avoid forcing mass gainer until symptoms settle.';
  } else if (weeklyWeightChange < minGain) {
    calorieChange = avgCalories < targets.calories * 0.9 ? 0 : 200;
    status = calorieChange ? 'Add calories' : 'Hit target first';
    message = calorieChange
      ? `Trend is ${weeklyWeightChange.toFixed(2)}kg/week, below your ${minGain}-${maxGain}kg lean-bulk target. Add about 200 kcal/day, mostly carbs around training.`
      : 'Weight trend is low, but logged calories are also well under target. Hit the current target consistently before raising it.';
  } else if (weeklyWeightChange > maxGain + 0.2 || waistChange > 1) {
    calorieChange = -150;
    status = 'Pull back slightly';
    message = `Trend is ${weeklyWeightChange.toFixed(2)}kg/week${waistChange ? ` and waist changed ${waistChange.toFixed(1)}cm` : ''}. Pull back 150 kcal/day to keep the bulk cleaner.`;
  }

  const nextCalories = Math.max(2200, targets.calories + calorieChange);
  const nextProtein = targets.protein;
  const nextFat = targets.fat;
  const nextCarbs = Math.max(150, Math.round((nextCalories - (nextProtein * 4) - (nextFat * 9)) / 4));

  return {
    status,
    message,
    suggested: { ...targets, calories: nextCalories, protein: nextProtein, fat: nextFat, carbs: nextCarbs },
    stats: { days: recent.length, avgCalories, avgProtein, weeklyWeightChange, waistChange },
  };
}

function App() {
  const [profile, setProfile] = useState(() => JSON.parse(localStorage.getItem('ascend:profile') || JSON.stringify(defaultProfile)));
  const [loggedMeals, setLoggedMeals] = useState(() => JSON.parse(localStorage.getItem('ascend:meals') || '[]'));
  const [checkIn, setCheckIn] = useState(() => JSON.parse(localStorage.getItem('ascend:checkin') || JSON.stringify(defaultCheckIn)));
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('ascend:history') || '[]'));
  const [syncStatus, setSyncStatus] = useState(firebaseReady ? 'Firebase ready' : 'Local mode');

  const targets = useMemo(() => buildTargets(profile), [profile]);

  useEffect(() => {
    localStorage.setItem('ascend:profile', JSON.stringify(profile));
    localStorage.setItem('ascend:meals', JSON.stringify(loggedMeals));
    localStorage.setItem('ascend:checkin', JSON.stringify(checkIn));
    localStorage.setItem('ascend:history', JSON.stringify(history));
  }, [profile, loggedMeals, checkIn, history]);

  const totals = useMemo(() => loggedMeals.reduce((sum, meal) => ({
    calories: sum.calories + meal.calories,
    protein: sum.protein + meal.protein,
    carbs: sum.carbs + meal.carbs,
    fat: sum.fat + meal.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [loggedMeals]);

  const coach = useMemo(() => buildAdaptiveCoach({ history, checkIn, totals, targets, profile }), [history, checkIn, totals, targets, profile]);
  const sunday = new Date().getDay() === 0;
  const monday = new Date().getDay() === 1;

  function addMeal(meal) {
    setLoggedMeals((current) => [...current, { ...meal, loggedAt: new Date().toISOString() }]);
  }

  function saveTodayToHistory() {
    const entry = { date: todayKey(), totals, checkIn, targets, profileSnapshot: profile };
    setHistory((current) => [...current.filter((item) => item.date !== entry.date), entry].sort((a, b) => a.date.localeCompare(b.date)));
    setSyncStatus('Saved today to trend history');
  }

  function applyCoachTargets() {
    setProfile((current) => ({
      ...current,
      calories: String(coach.suggested.calories),
      protein: String(coach.suggested.protein),
      carbs: String(coach.suggested.carbs),
      fat: String(coach.suggested.fat),
    }));
    setSyncStatus('Applied adaptive macro targets');
  }

  function clearToday() {
    setLoggedMeals([]);
    setCheckIn({ ...defaultCheckIn, date: todayKey(), weight: profile.currentWeight || profile.startWeight || '85' });
  }

  async function cloudSave() {
    if (!firebaseReady) {
      setSyncStatus('Local mode only — add Firebase env vars to enable cloud sync.');
      return;
    }
    try {
      await saveCloudState({ profile, loggedMeals, checkIn, history, targets });
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
      if (data?.profile) setProfile(data.profile);
      if (data?.loggedMeals) setLoggedMeals(data.loggedMeals);
      if (data?.checkIn) setCheckIn(data.checkIn);
      if (data?.history) setHistory(data.history);
      setSyncStatus(data ? 'Loaded from Firebase' : 'No cloud data yet');
    } catch (error) {
      setSyncStatus(`Firebase load failed: ${error.message}`);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ date: todayKey(), profile, targets, totals, loggedMeals, checkIn, history, coach }, null, 2)], { type: 'application/json' });
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
          <p className="hero-copy">Tailored macro tracker preloaded with Brad's Ascending goals. It learns from daily weight, calories, protein, waist, gym and gut data, then suggests small weekly macro adjustments.</p>
        </div>
        <div className="target-pill"><TrendingUp size={18}/> {profile.currentWeight || profile.startWeight}kg · {targets.calories} kcal</div>
      </header>

      {(sunday || monday) && (
        <section className="warning-card">
          <Waves />
          <div><strong>{sunday ? 'Sunday Reta context' : 'Monday gut window'}</strong><p>Bias easier foods today: oats, smoothies, rice, chicken, yoghurt, bananas, electrolytes. Avoid greasy hero meals and naked black coffee.</p></div>
        </section>
      )}

      <section className="grid two-col top-panels">
        <section className="card">
          <div className="section-head inline"><Settings/><h2>Preloaded profile + goals</h2></div>
          <div className="profile-grid">
            <label>Name<input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })}/></label>
            <label>Age<input value={profile.age} onChange={(e) => setProfile({ ...profile, age: e.target.value })}/></label>
            <label>Height<input value={profile.height} onChange={(e) => setProfile({ ...profile, height: e.target.value })}/></label>
            <label>Current weight kg<input value={profile.currentWeight} onChange={(e) => { setProfile({ ...profile, currentWeight: e.target.value }); setCheckIn({ ...checkIn, weight: e.target.value }); }}/></label>
            <label>Goal<input value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })}/></label>
            <label>Target gain kg/week<input value={profile.weeklyGainMin + '-' + profile.weeklyGainMax} readOnly /></label>
          </div>
          <label>Strategy<textarea value={profile.strategy} onChange={(e) => setProfile({ ...profile, strategy: e.target.value })}/></label>
        </section>

        <section className="card coach-card">
          <div className="section-head inline"><SlidersHorizontal/><h2>Adaptive macro coach</h2></div>
          <p className="tag big-tag">{coach.status}</p>
          <p className="coach-message">{coach.message}</p>
          <div className="stat-strip">
            <span>{coach.stats.days} days</span>
            <span>{Math.round(coach.stats.avgCalories || 0)} avg kcal</span>
            <span>{Math.round(coach.stats.avgProtein || 0)} avg protein</span>
            <span>{coach.stats.weeklyWeightChange.toFixed(2)}kg/wk</span>
          </div>
          <div className="suggestion-box">
            <strong>Suggested next targets</strong>
            <p>{coach.suggested.calories} kcal · {coach.suggested.protein}P · {coach.suggested.carbs}C · {coach.suggested.fat}F</p>
          </div>
          <button onClick={applyCoachTargets}>Apply suggested targets</button>
        </section>
      </section>

      <section className="grid dashboard">
        <MacroCard label="Calories" value={totals.calories} target={targets.calories} unit="" />
        <MacroCard label="Protein" value={totals.protein} target={targets.protein} unit="g" />
        <MacroCard label="Carbs" value={totals.carbs} target={targets.carbs} unit="g" />
        <MacroCard label="Fat" value={totals.fat} target={targets.fat} unit="g" />
      </section>

      <section className="card target-editor">
        <div className="section-head inline"><SlidersHorizontal/><h2>Macro target editor</h2></div>
        <div className="form-grid four">
          <label>Calories<input value={profile.calories} onChange={(e) => setProfile({ ...profile, calories: e.target.value })}/></label>
          <label>Protein g<input value={profile.protein} onChange={(e) => setProfile({ ...profile, protein: e.target.value })}/></label>
          <label>Carbs g<input value={profile.carbs} onChange={(e) => setProfile({ ...profile, carbs: e.target.value })}/></label>
          <label>Fat g<input value={profile.fat} onChange={(e) => setProfile({ ...profile, fat: e.target.value })}/></label>
        </div>
        <p className="soft">Starts with your Ascending defaults: 3,100 kcal, 180g protein, 425g carbs, 75g fat. The coach can suggest changes after enough saved daily logs.</p>
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
          <button onClick={saveTodayToHistory}><CalendarDays/> Save today to trend history</button>
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

      <section className="card history-card">
        <div className="section-head inline"><CalendarDays/><h2>Trend history</h2></div>
        {history.length === 0 ? <p className="soft">No saved days yet. Save today after logging meals/check-in.</p> : (
          <div className="history-list">
            {history.slice(-7).reverse().map((entry) => (
              <div key={entry.date} className="history-row">
                <strong>{entry.date}</strong>
                <span>{entry.checkIn?.weight || '-'}kg</span>
                <span>{Math.round(entry.totals?.calories || 0)} kcal</span>
                <span>{Math.round(entry.totals?.protein || 0)}P</span>
              </div>
            ))}
          </div>
        )}
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
