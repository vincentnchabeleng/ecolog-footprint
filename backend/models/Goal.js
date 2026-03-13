const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Goal name is required'],
    trim: true,
    maxlength: [120, 'Goal name cannot exceed 120 characters'],
  },
  target: {
    type: Number,
    required: [true, 'Target value is required'],
    min: [0.1, 'Target must be greater than 0'],
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'streak'],
    default: 'weekly',
  },
  unit: {
    type: String,
    default: 'kg CO₂',
  },
  active: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
  toJSON: { transform(doc, ret) { delete ret.__v; return ret; } },
});

module.exports = mongoose.model('Goal', goalSchema);
