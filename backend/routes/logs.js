const express  = require('express');
const { body, validationResult } = require('express-validator');
const Goal     = require('../models/Goal');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// GET /api/goals
router.get('/', async (req, res) => {
  try {
    const goals = await Goal.find({ user: req.user._id, active: true }).sort({ createdAt: 1 });
    res.json({ goals });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch goals.' });
  }
});

// POST /api/goals
router.post('/',
  [
    body('name').trim().notEmpty().isLength({ max: 120 }),
    body('target').isFloat({ min: 0.1 }),
    body('type').isIn(['daily','weekly','streak']),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      const { name, target, type, unit } = req.body;
      const goal = await Goal.create({ user: req.user._id, name, target, type, unit: unit || 'kg CO₂' });
      res.status(201).json({ goal });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create goal.' });
    }
  }
);

// DELETE /api/goals/:id
router.delete('/:id', async (req, res) => {
  try {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.user._id });
    if (!goal) return res.status(404).json({ error: 'Goal not found.' });
    await goal.deleteOne();
    res.json({ message: 'Goal deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete goal.' });
  }
});

module.exports = router;
