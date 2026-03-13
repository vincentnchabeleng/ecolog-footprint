const express     = require('express');
const ActivityLog = require('../models/ActivityLog');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// ─────────────────────────────────────────────────────────────────
// GET /api/stats/summary
// Returns today/week/month totals + streak
// ─────────────────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const now       = new Date();
    const todayStart = new Date(now.setHours(0,0,0,0));
    const weekStart  = new Date(Date.now() - 7  * 86400000);
    const monthStart = new Date(Date.now() - 30 * 86400000);

    const [todayTotal, weekTotal, monthTotal] = await Promise.all([
      ActivityLog.totalCO2(req.user._id, todayStart),
      ActivityLog.totalCO2(req.user._id, weekStart),
      ActivityLog.totalCO2(req.user._id, monthStart),
    ]);

    // Calculate streak (consecutive days with at least one log)
    const recentLogs = await ActivityLog.find({ user: req.user._id })
      .sort({ loggedAt: -1 })
      .select('loggedAt');

    const logDays = new Set(recentLogs.map(l => new Date(l.loggedAt).toDateString()));
    let streak = 0;
    const d = new Date();
    while (logDays.has(d.toDateString())) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    res.json({ todayTotal, weekTotal, monthTotal, streak });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary stats.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/stats/categories  — CO₂ grouped by category
// ─────────────────────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const { from, to } = req.query;
    const categories = await ActivityLog.byCategoryForUser(
      req.user._id,
      from ? new Date(from) : undefined,
      to   ? new Date(to)   : undefined
    );
    res.json({ categories });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch category breakdown.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/stats/daily  — daily totals for last N days
// ─────────────────────────────────────────────────────────────────
router.get('/daily', async (req, res) => {
  try {
    const days   = Math.min(parseInt(req.query.days) || 30, 365);
    const totals = await ActivityLog.dailyTotals(req.user._id, days);
    res.json({ totals, days });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch daily totals.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/stats/insights  — Insight Engine output
// Identifies highest-emission categories and generates personalised tips
// ─────────────────────────────────────────────────────────────────
const TIPS = {
  transport:[
    { title:'Cycle for short trips',    text:'Cycling instead of driving for trips under 5km saves up to 2.4kg CO₂ per trip.' },
    { title:'Use public transport',     text:'Bus or train instead of driving cuts your transport emissions by up to 70%.' },
    { title:'Try working from home',    text:'One WFH day per week saves 2.4–4.8kg CO₂ in avoided commuting.' },
  ],
  food:[
    { title:'Go meat-free one day/week',text:'Replacing one beef meal with vegetarian saves 3.4kg CO₂.' },
    { title:'Reduce food waste',        text:'Plan your meals — food waste contributes 8–10% of global emissions.' },
    { title:'Choose local produce',     text:'Local food has a far lower transport footprint than imported alternatives.' },
  ],
  energy:[
    { title:'Switch to LED lighting',   text:'LED bulbs use 75% less energy, saving ~0.5kg CO₂/day for a full home.' },
    { title:'Adjust your thermostat',   text:'Lowering heating by 1°C reduces energy use by 5–10%, saving ~0.4kg CO₂/day.' },
    { title:'Shorten your shower',      text:'Cutting shower time from 10 to 5 minutes saves 0.17kg CO₂ per shower.' },
  ],
  shopping:[
    { title:'Buy second-hand',          text:'Second-hand clothing avoids the 5.5kg CO₂ production footprint of new garments.' },
    { title:'Keep devices longer',      text:'Extending your phone\'s life by 1 year avoids ~40kg CO₂ in manufacturing emissions.' },
  ],
  other:[
    { title:'Go paperless',             text:'Opt for digital documents to cut paper consumption and printing energy use.' },
    { title:'Recycle consistently',     text:'Recycling aluminium saves 95% of the energy needed to produce it from raw ore.' },
  ],
};

router.get('/insights', async (req, res) => {
  try {
    const monthStart = new Date(Date.now() - 30 * 86400000);
    const categories = await ActivityLog.byCategoryForUser(req.user._id, monthStart);

    // Top category — drives personalised tips
    const topCategory = categories[0]?._id || 'transport';
    const tips = [
      ...(TIPS[topCategory] || []),
      ...(TIPS.food || []),
    ].slice(0, 5);

    // Identify top 3 activities by total CO₂
    const topActivities = await ActivityLog.aggregate([
      { $match: { user: req.user._id, loggedAt: { $gte: monthStart } } },
      { $group: { _id: '$name', total: { $sum: '$co2' }, count: { $sum: 1 }, category: { $first: '$category' } } },
      { $sort: { total: -1 } },
      { $limit: 3 },
    ]);

    // Weekly goal progress
    const weekStart  = new Date(Date.now() - 7 * 86400000);
    const weekTotal  = await ActivityLog.totalCO2(req.user._id, weekStart);
    const weeklyGoal = req.user.weeklyGoal || 20;
    const progress   = Math.min(100, Math.round((weekTotal / weeklyGoal) * 100));

    res.json({
      topCategory,
      categories,
      tips,
      topActivities,
      weeklyGoalProgress: {
        current:  Math.round(weekTotal * 100) / 100,
        target:   weeklyGoal,
        progress,
        onTrack:  weekTotal <= weeklyGoal,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate insights.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/stats/community  — community comparison
// ─────────────────────────────────────────────────────────────────
router.get('/community', async (req, res) => {
  try {
    const weekStart = new Date(Date.now() - 7 * 86400000);
    const myWeekly  = await ActivityLog.totalCO2(req.user._id, weekStart);

    // Simulated community data (replace with real aggregation when you have real users)
    const communityAvg = 24.5;
    const nationalAvg  = 210;

    res.json({
      myWeekly: Math.round(myWeekly * 100) / 100,
      communityAvg,
      nationalAvg,
      percentileBetter: myWeekly < communityAvg
        ? Math.round(((communityAvg - myWeekly) / communityAvg) * 100)
        : 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch community stats.' });
  }
});

module.exports = router;
