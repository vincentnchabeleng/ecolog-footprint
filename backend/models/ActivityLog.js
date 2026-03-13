const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,      // index for fast per-user queries
  },
  actId: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    required: [true, 'Activity name is required'],
    trim: true,
    maxlength: [100, 'Activity name cannot exceed 100 characters'],
  },
  category: {
    type: String,
    required: true,
    enum: ['food', 'transport', 'energy', 'shopping', 'other'],
    index: true,      // index for category-filtered queries
  },
  icon: {
    type: String,
    default: '📌',
  },
  co2: {
    type: Number,
    required: [true, 'CO₂ value is required'],
    min: [0, 'CO₂ value cannot be negative'],
    set: v => Math.round(v * 100) / 100,   // store max 2 decimal places
  },
  quantity: {
    type: Number,
    default: 1,
    min: [1, 'Quantity must be at least 1'],
  },
  unit: {
    type: String,
    default: 'unit',
    trim: true,
  },
  note: {
    type: String,
    trim: true,
    maxlength: [200, 'Note cannot exceed 200 characters'],
    default: '',
  },
  loggedAt: {
    type: Date,
    default: Date.now,
    index: true,       // index for date-range queries
  },
}, {
  timestamps: true,
  toJSON: { transform(doc, ret) { delete ret.__v; return ret; } },
});

// Compound index for efficient user + date range queries
activityLogSchema.index({ user: 1, loggedAt: -1 });
activityLogSchema.index({ user: 1, category: 1, loggedAt: -1 });

// Static — total CO₂ for a user in a date range
activityLogSchema.statics.totalCO2 = async function (userId, from, to) {
  const match = { user: userId };
  if (from || to) {
    match.loggedAt = {};
    if (from) match.loggedAt.$gte = from;
    if (to)   match.loggedAt.$lte = to;
  }
  const result = await this.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$co2' } } },
  ]);
  return result[0]?.total || 0;
};

// Static — CO₂ grouped by category for a user
activityLogSchema.statics.byCategoryForUser = async function (userId, from, to) {
  const match = { user: userId };
  if (from || to) { match.loggedAt = {}; if (from) match.loggedAt.$gte = from; if (to) match.loggedAt.$lte = to; }
  return this.aggregate([
    { $match: match },
    { $group: { _id: '$category', total: { $sum: '$co2' }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
  ]);
};

// Static — daily totals for the last N days
activityLogSchema.statics.dailyTotals = async function (userId, days = 30) {
  const from = new Date(Date.now() - days * 86400000);
  return this.aggregate([
    { $match: { user: userId, loggedAt: { $gte: from } } },
    { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$loggedAt' } },
        total: { $sum: '$co2' },
    }},
    { $sort: { _id: 1 } },
  ]);
};

module.exports = mongoose.model('ActivityLog', activityLogSchema);
