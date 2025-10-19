// Replace the chat endpoint in server.js with this logic:

app.post('/api/chat/message', async (req, res) => {
  try {
    const { content } = req.body;
    
    // Get userId from authenticated session
    const userId = req.session.userId || req.body.memberId; // fallback for testing
    if (!userId || !content) {
      return res.status(400).json({ error: 'Authentication required' });
    }

    // If userId is a number, it's from authentication - look up tour_party member
    let memberId;
    if (typeof userId === 'number') {
      // Query database to find tour_party member for this user
      const memberQuery = await pool.query('SELECT member_id FROM tour_party WHERE username = (SELECT username FROM users WHERE id = $1)', [userId]);
      if (memberQuery.rows.length === 0) {
        return res.status(400).json({ error: 'No tour member found for authenticated user' });
      }
      memberId = memberQuery.rows[0].member_id;
    } else {
      // Direct member_id for testing
      memberId = userId;
    }

    const result = await processor.processMessage(
      content,
      {},
      { member_id: memberId }
    );
    res.json(result);
  } catch (err) {
    console.error('[Server] Error handling /api/chat/message:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
