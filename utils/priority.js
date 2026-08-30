/**
 * Priority scoring calculation based on section 5.11 of the specification:
 * Score = upvotes * 2 + daysSinceCreated
 * Score < 5    -> Low
 * Score 5–15   -> Medium
 * Score 16–30  -> High
 * Score > 30   -> Critical
 */

function computePriority(upvotes = 0, createdAt = new Date()) {
  const createdTime = new Date(createdAt).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - createdTime);
  const daysSinceCreated = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  const numericUpvotes = Math.max(0, Number(upvotes) || 0);
  const score = numericUpvotes * 2 + daysSinceCreated;

  let level = 'Low';
  if (score > 30) {
    level = 'Critical';
  } else if (score >= 16) {
    level = 'High';
  } else if (score >= 5) {
    level = 'Medium';
  } else {
    level = 'Low';
  }

  return {
    score,
    level,
    daysSinceCreated,
  };
}

/**
 * Attaches computed priority fields to a Mongoose document or plain JS object.
 */
function attachPriority(complaintDoc) {
  if (!complaintDoc) return null;
  const complaint = typeof complaintDoc.toObject === 'function' ? complaintDoc.toObject() : { ...complaintDoc };
  
  const { score, level, daysSinceCreated } = computePriority(complaint.upvotes, complaint.createdAt);
  complaint.priority = level;
  complaint.priorityScore = score;
  complaint.daysSinceCreated = daysSinceCreated;

  return complaint;
}

/**
 * Attaches computed priority fields to an array of complaints.
 */
function attachPriorityToArray(complaints = []) {
  return complaints.map(attachPriority);
}

module.exports = {
  computePriority,
  attachPriority,
  attachPriorityToArray,
};
