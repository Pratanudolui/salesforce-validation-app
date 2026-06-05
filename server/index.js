const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config({ path: 'C:\\Users\\USER\\Desktop\\salesforce-validation-app\\.env' });

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.REACT_APP_SF_CLIENT_ID;
const CLIENT_SECRET = process.env.SF_CLIENT_SECRET;
const REDIRECT_URI = process.env.REACT_APP_REDIRECT_URI;

app.post('/api/token', async (req, res) => {
  const { code, code_verifier } = req.body;
  try {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
      ...(code_verifier ? { code_verifier } : {}),
    });
    const response = await axios.post(
      'https://login.salesforce.com/services/oauth2/token',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    res.json(response.data);
  } catch (err) {
    console.error('Token exchange FAILED:', JSON.stringify(err.response?.data || err.message));
    res.status(500).json({ error: 'Token exchange failed', details: err.response?.data });
  }
});

app.post('/api/rules', async (req, res) => {
  const { accessToken, instanceUrl } = req.body;
  try {
    const query = encodeURIComponent(
      "SELECT Id, ValidationName, Active, Description FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = 'Account'"
    );
    const response = await axios.get(
      `${instanceUrl}/services/data/v59.0/tooling/query?q=${query}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    res.json(response.data);
  } catch (err) {
    console.error('Rules fetch error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

app.post('/api/toggle', async (req, res) => {
  const { accessToken, instanceUrl, ruleId, active } = req.body;
  try {
    const response = await axios.get(
      `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const existingMetadata = response.data.Metadata;
    await axios.patch(
      `${instanceUrl}/services/data/v59.0/tooling/sobjects/ValidationRule/${ruleId}`,
      { Metadata: { ...existingMetadata, active } },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Toggle error:', JSON.stringify(err.response?.data || err.message));
    res.status(500).json({ error: 'Failed to toggle rule' });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));