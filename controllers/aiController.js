const Complaint = require('../models/Complaint');
const { attachPriorityToArray } = require('../utils/priority');

// Fallback intelligent summary generator when AI keys are absent or API is unreachable
function generateRuleBasedBriefing(stats) {
  const sentences = [];

  // Sentence 1: General volume & incoming activity
  if (stats.totalComplaints === 0) {
    return "All civic services are currently running smoothly with zero active complaints reported. Keep monitoring for incoming reports from citizens.";
  }

  sentences.push(
    `Today's briefing: A total of ${stats.totalComplaints} complaints are logged across the municipality, with ${stats.newToday} new reports submitted in the past 24 hours.`
  );

  // Sentence 2: Critical issues and hotspots
  if (stats.criticalCount > 0) {
    const topAreaStr = stats.hotspotAreas.length > 0 ? `concentrated in ${stats.hotspotAreas[0].area}` : 'across municipal sectors';
    sentences.push(
      `${stats.criticalCount} complaints have escalated to Critical priority, primarily ${topAreaStr} requiring immediate field inspection.`
    );
  } else if (stats.overdueCount > 0) {
    sentences.push(
      `${stats.overdueCount} complaints are overdue past our 3-day resolution target and should be expedited to the relevant maintenance teams.`
    );
  } else {
    sentences.push(
      `No critical escalations are currently pending, and response times remain within standard SLA parameters.`
    );
  }

  // Sentence 3: Category breakdown
  if (stats.topCategories.length > 0) {
    const topCat = stats.topCategories[0];
    sentences.push(
      `${topCat.category} issues represent the largest volume of citizen reports (${topCat.count} cases, ${topCat.percentage}% of total).`
    );
  }

  // Sentence 4: Resolution & Satisfaction progress
  if (stats.resolvedThisWeek > 0) {
    const satStr = stats.avgCitizenRating > 0 ? ` with an average citizen satisfaction score of ${stats.avgCitizenRating} / 5` : '';
    sentences.push(
      `${stats.resolvedThisWeek} complaints were successfully resolved this week${satStr}.`
    );
  } else if (stats.resolvedCount > 0) {
    sentences.push(
      `${stats.resolvedCount} total complaints have been marked resolved to date.`
    );
  }

  return sentences.join(' ');
}

// @desc    Generate an AI Daily Briefing summary for Officers
// @route   POST /api/ai/officer-summary or GET /api/ai/officer-summary
// @access  Private (Officer Only)
const getOfficerSummary = async (req, res) => {
  try {
    const rawComplaints = await Complaint.find().populate('createdBy', 'name email');
    const complaints = attachPriorityToArray(rawComplaints);

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

    let newToday = 0;
    let overdueCount = 0;
    let resolvedThisWeek = 0;
    let pendingCount = 0;
    let inProgressCount = 0;
    let resolvedCount = 0;
    let criticalCount = 0;
    let highCount = 0;
    let ratedComplaintsCount = 0;
    let totalRatingSum = 0;

    const categoryMap = {};
    const areaMap = {};

    complaints.forEach((c) => {
      const createdTime = new Date(c.createdAt).getTime();
      const updatedTime = new Date(c.updatedAt || c.createdAt).getTime();

      // Counts by status
      if (c.status === 'Pending') pendingCount++;
      if (c.status === 'In Progress') inProgressCount++;
      if (c.status === 'Resolved') resolvedCount++;

      // Today's submissions
      if (createdTime >= oneDayAgo) {
        newToday++;
      }

      // Overdue (> 3 days and not resolved)
      if (c.status !== 'Resolved' && createdTime <= threeDaysAgo) {
        overdueCount++;
      }

      // Resolved this week
      if (c.status === 'Resolved' && updatedTime >= sevenDaysAgo) {
        resolvedThisWeek++;
      }

      // Priorities
      if (c.priority === 'Critical') criticalCount++;
      if (c.priority === 'High') highCount++;

      // Category breakdown
      categoryMap[c.category] = (categoryMap[c.category] || 0) + 1;

      // Area hotspot (focus on active complaints)
      if (c.status !== 'Resolved') {
        areaMap[c.area] = (areaMap[c.area] || 0) + 1;
      }

      // Feedback stats
      if (c.feedbackGiven && c.feedbackRating) {
        ratedComplaintsCount++;
        totalRatingSum += Number(c.feedbackRating);
      }
    });

    const totalComplaints = complaints.length;

    const topCategories = Object.entries(categoryMap)
      .map(([category, count]) => ({
        category,
        count,
        percentage: totalComplaints > 0 ? Math.round((count / totalComplaints) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const hotspotAreas = Object.entries(areaMap)
      .map(([area, activeCount]) => ({ area, activeCount }))
      .sort((a, b) => b.activeCount - a.activeCount)
      .slice(0, 5);

    const avgCitizenRating =
      ratedComplaintsCount > 0
        ? Number((totalRatingSum / ratedComplaintsCount).toFixed(1))
        : 0;

    const stats = {
      totalComplaints,
      total: totalComplaints,
      totalActive: pendingCount + inProgressCount,
      activeCount: pendingCount + inProgressCount,
      pendingCount,
      pending: pendingCount,
      inProgressCount,
      inProgress: inProgressCount,
      resolvedCount,
      resolved: resolvedCount,
      newToday,
      overdueCount,
      resolvedThisWeek,
      criticalCount,
      critical: criticalCount,
      highCount,
      topCategories,
      hotspotAreas,
      ratedComplaintsCount,
      avgCitizenRating,
      averageCitizenRating: avgCitizenRating,
    };

    let aiSummaryText = null;

    // 1. Attempt Anthropic Claude API if key exists
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY.trim(),
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 450,
            system:
              'You are a concise government operations assistant. Summarize these complaint stats in 3–5 plain English sentences for an officer. Highlight critical issues, overdue items, hotspot areas, and recent resolution numbers directly and professionally.',
            messages: [
              {
                role: 'user',
                content: `Here are the latest civic complaint statistics:\n${JSON.stringify(stats, null, 2)}`,
              },
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.content && data.content[0] && data.content[0].text) {
            aiSummaryText = data.content[0].text.trim();
          }
        } else {
          const errData = await response.text();
          console.warn('Claude API non-200 response:', errData);
        }
      } catch (claudeErr) {
        console.warn('Claude API request failed:', claudeErr.message);
      }
    }

    // 2. Attempt Google Gemini API if Gemini key exists and Claude wasn't used
    if (!aiSummaryText && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY.trim()}`;
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are a concise government operations assistant. Summarize these complaint stats in 3–5 plain English sentences for an officer:\n${JSON.stringify(stats, null, 2)}`,
                  },
                ],
              },
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            aiSummaryText = candidateText.trim();
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini API request failed:', geminiErr.message);
      }
    }

    // 3. Fallback to robust rule-based summary synthesizer
    if (!aiSummaryText) {
      aiSummaryText = generateRuleBasedBriefing(stats);
    }

    res.status(200).json({
      success: true,
      summary: aiSummaryText,
      stats,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('getOfficerSummary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error generating officer summary.',
    });
  }
};

module.exports = {
  getOfficerSummary,
};
